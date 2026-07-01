import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, QueryRunner, Not, In } from 'typeorm'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { RegisterTransactionInput } from './dto/register-transaction.input'
import { Item } from '../items/entities/item.entity' // Necesario para actualizar stock
import { TransactionType } from './enums/transaction-type.enum'
import {
  FinancialDataPoint,
  FinancialReportResponse,
} from './dto/financial-report.output'
import { ReportGroupBy } from './enums/report-group-by.enum'
import { ItemsService } from 'src/items/items.service'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { RecipesService } from 'src/recipes/recipes.service'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { ItemErrorCode } from 'src/items/enums/item-error-code.enum'
import { UserStatsMetadata } from './dto/user-stats-metadata.output'
import { MOCK_DATA } from './inventory-transaction.mock'

@Injectable()
export class InventoryTransactionsService {
  private readonly MAX_OPERATIONAL_BATCH_SIZE = 100
  constructor(
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly dataSource: DataSource, // Para manejar la transacción atómica
    @Inject(forwardRef(() => ItemsService)) // 👈 Importante para evitar dependencia circular
    private readonly itemsService: ItemsService,
    @Inject(forwardRef(() => RecipesService))
    private readonly recipesService: RecipesService,
  ) {}

  /**
   * Registra un movimiento de stock de manera atómica, garantizando que
   * 1. Se crea el registro de la transacción.
   * 2. Se actualiza el stock del ítem.
   * * @param userId ID del usuario que realiza la acción
   * @param input Los datos de la transacción
   * @param queryRunner (Opcional) Un QueryRunner externo para anidar esta lógica
   */
  async registerMovement(
    userId: string,
    input: RegisterTransactionInput,
    externalRunner?: QueryRunner,
  ): Promise<InventoryTransaction> {
    const runner = externalRunner || this.dataSource.createQueryRunner()

    if (!externalRunner) {
      await runner.connect()
      await runner.startTransaction()
    }

    try {
      const item = await runner.manager.findOne(Item, {
        where: { id: input.itemId, userId },
      })

      if (!item) throw new BadRequestException(ItemErrorCode.ITEM_NOT_FOUND)

      // --- 0. NORMALIZACIÓN DE CANTIDAD ---
      const outTypes = [
        TransactionType.SALE,
        TransactionType.ADJUSTMENT_OUT,
        TransactionType.CONSUMPTION,
      ]

      let finalQuantity: number
      if (input.type === TransactionType.MEASUREMENT_ADJUSTMENT) {
        finalQuantity = input.quantity
      } else {
        finalQuantity = outTypes.includes(input.type)
          ? -Math.abs(input.quantity)
          : Math.abs(input.quantity)
      }

      // --- 1. VALIDACIÓN DE STOCK ---
      if (outTypes.includes(input.type)) {
        if (Number(item.stock) + finalQuantity < 0) {
          throw new BadRequestException(ItemErrorCode.INSUFFICIENT_STOCK)
        }
      }

      // --- 2. SNAPSHOTS DE PRECIOS ---
      // Redondeamos a centavos enteros para evitar ruidos de punto flotante
      const unitCostSnapshot = Math.round(
        input.unitCostSnapshot ?? Number(item.costPrice ?? 0),
      )
      let salePriceSnapshot = Math.round(input.salePriceSnapshot ?? 0)

      if (input.type === TransactionType.SALE && !input.salePriceSnapshot) {
        salePriceSnapshot = Number(item.salePrice ?? 0)
      }

      // --- 3. CREAR EL REGISTRO DE TRANSACCIÓN ---
      const newTransaction = runner.manager.create(InventoryTransaction, {
        ...input,
        quantity: finalQuantity,
        userId,
        unitCostSnapshot,
        salePriceSnapshot,
      })
      const savedTransaction = await runner.manager.save(newTransaction)

      // --- 4. GESTIÓN CRÍTICA DE COSTOS MAESTROS (Tu lógica) ---
      const isPurchase =
        input.type === TransactionType.PURCHASE ||
        input.type === TransactionType.INITIAL_INVENTORY

      const priceWasProvided =
        input.unitCostSnapshot !== undefined && input.unitCostSnapshot !== null

      if (isPurchase && priceWasProvided) {
        /**
         * CASO 1: Insumos o Productos de Reventa (Ej: Harina, Coca-Cola)
         * Si NO es producido, el costo de la COMPRA manda.
         * Actualizamos la ficha y propagamos el costo a las recetas que lo usen.
         */
        if (!item.isProduced) {
          await runner.manager.update(Item, item.id, {
            costPrice: unitCostSnapshot,
          })

          if (item.isIngredient) {
            // Si la Coca-Cola o la Harina subieron de precio, actualizamos los combos o panes
            await this.recipesService.syncRecipeCostsByIngredient(
              userId,
              item.id,
              runner,
            )
          }
        } else {
          /**
          CASO 2: Producto Producido (Ej: Dulce de Leche artesanal)
          Aunque lo hayamos comprado hoy por una emergencia, NO tocamos el costo maestro.
          El costo del Dulce de Leche en la ficha sigue siendo lo que diga su receta.
         */
          console.log(
            `[Cost Shield] Compra de ${item.name} registrada, pero se mantiene costo de receta.`,
          )
        }
      }

      const updateData: any = {}

      if (!item.isInitialized) {
        updateData.isInitialized = true
      }

      // Si hay algo que actualizar (isInitialized), lo hacemos.
      if (Object.keys(updateData).length > 0) {
        await runner.manager.update(Item, item.id, updateData)
      }

      // --- 5. ACTUALIZAR STOCK FÍSICO ---
      await runner.manager.increment(
        Item,
        { id: input.itemId },
        'stock',
        finalQuantity,
      )

      if (!externalRunner) await runner.commitTransaction()
      return savedTransaction
    } catch (err) {
      if (!externalRunner) await runner.rollbackTransaction()
      throw err
    } finally {
      if (!externalRunner) await runner.release()
    }
  }

  async findByItem(
    itemId: string,
    userId: string,
    pagination: PaginationInput, // <-- Nuevo argumento
  ): Promise<{ transactions: InventoryTransaction[]; total: number }> {
    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where: { itemId, userId },
        order: { createdAt: 'DESC' },
        take: pagination.limit, // Cuántos traer
        skip: pagination.offset, // Cuántos saltar
      },
    )

    return { transactions, total }
  }

  /**
   * Genera un reporte financiero consolidado agrupando transacciones por tiempo.
   * Utiliza un JOIN con la tabla de ítems para unificar el historial de productos
   * que han sido clonados (versionados), permitiendo que las ventas de un ítem "hijo"
   * computen junto a las de su "padre" original mediante el parent_id.
   */

  private readonly USE_MOCK = false // Activa esto para pruebas

  async getFinancialReport(
    userId: string,
    page: number,
    groupBy: ReportGroupBy,
  ): Promise<FinancialReportResponse> {
    // 1. Obtener datos desde la base de datos (Ordenados por fecha ASC)
    const results = this.USE_MOCK
      ? MOCK_DATA.sort((a, b) => a.label.localeCompare(b.label)) // Forzamos orden ASC
      : await this.transactionRepository
          .createQueryBuilder('t')
          .select(
            `TO_CHAR(DATE_TRUNC('${groupBy}', t.createdAt), 'YYYY-MM')`,
            'label',
          )
          .addSelect(
            "SUM(CASE WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.salePriceSnapshot WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.salePriceSnapshot ELSE 0 END)",
            'revenue',
          )
          // .addSelect(
          //   "SUM(CASE WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.unit_cost_snapshot WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.unit_cost_snapshot WHEN t.type IN ('CONSUMPTION', 'PRODUCTION_OUT') THEN ABS(t.quantity) * t.unit_cost_snapshot ELSE 0 END)",
          //   'cost',
          // )
          .addSelect(
            `SUM(CASE 
              WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.unit_cost_snapshot 
              WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.unit_cost_snapshot 
              ELSE 0 END)`,
            'cost',
          )
          .addSelect(
            "SUM(CASE WHEN t.type = 'ADJUSTMENT_OUT' THEN ABS(t.quantity) * t.unit_cost_snapshot ELSE 0 END)",
            'losses',
          )
          .where('t.userId = :userId', { userId })
          .leftJoin('t.sale', 'sale')
          .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
          .groupBy('label')
          .orderBy('label', 'ASC')
          .getRawMany()

    if (results.length === 0) {
      return {
        data: [],
        avgProfit: 0,
        canGoBack: false,
        canGoForward: false,
        range: { start: '', end: '' },
      }
    }

    // 2. Definir ventana y paginación (Lógica corregida para orden cronológico)
    const windowSize = 6
    const totalResults = results.length
    // page 0 = últimos 6 meses, page 1 = 6 meses anteriores...
    const startIndex = Math.max(0, totalResults - (page + 1) * windowSize)
    const endIndex = totalResults - page * windowSize

    const pageData = results.slice(startIndex, endIndex)

    // 3. Mapeo de datos (Ajustado para aceptar números o strings)
    const realDataPoints: FinancialDataPoint[] = pageData.map((r) => {
      // Convertimos a string primero para que .split('.') siempre funcione
      const revStr = String(r.revenue || '0').split('.')[0]
      const cstStr = String(r.cost || '0').split('.')[0]
      const losStr = String(r.losses || '0').split('.')[0]

      const rev = BigInt(revStr)
      const cst = BigInt(cstStr)
      const los = BigInt(losStr)

      return {
        label: r.label.trim(),
        revenue: Number(rev),
        cost: Number(cst),
        losses: Number(los),
        netProfit: Number(rev - cst - los),
      }
    })

    // 4. Construcción del array cronológico [Viejo -> Nuevo]
    const data: FinancialDataPoint[] = []

    if (realDataPoints.length > 0 && realDataPoints.length < windowSize) {
      const missingCount = windowSize - realDataPoints.length
      const referenceDate = new Date(realDataPoints[0].label + '-01')

      for (let i = missingCount; i > 0; i--) {
        const prevDate = new Date(referenceDate)
        prevDate.setMonth(prevDate.getMonth() - i)
        data.push({
          label: prevDate.toISOString().slice(0, 7),
          revenue: 0,
          cost: 0,
          losses: 0,
          netProfit: 0,
        })
      }
    }

    // B. Agregar los datos reales
    data.push(...realDataPoints)

    // 5. Cálculo de promedio (basado solo en meses con actividad real en el set actual)
    const totalNetBig = realDataPoints.reduce(
      (sum, p) => sum + BigInt(p.netProfit),
      BigInt(0),
    )
    const avgProfit =
      realDataPoints.length > 0
        ? Number(totalNetBig) / realDataPoints.length
        : 0

    return {
      data,
      avgProfit: Math.round(avgProfit),
      // Navegación lógica: si estamos en page 0, canGoBack es true si hay más datos antiguos
      canGoBack: startIndex > 0,
      canGoForward: endIndex < totalResults,
      range: {
        // Usamos pageData (la ventana actual) para definir el rango visible
        start: pageData.length > 0 ? pageData[0].label.trim() : '',
        end:
          pageData.length > 0 ? pageData[pageData.length - 1].label.trim() : '',
      },
    }
  }
  /**
   * Verifica la primer transaccion a la db.
   *
   */

  async getUserStatsMetadata(userId: string): Promise<UserStatsMetadata> {
    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .select("TO_CHAR(MIN(t.createdAt), 'YYYY-MM')", 'firstMonth')
      .addSelect("TO_CHAR(MAX(t.createdAt), 'YYYY-MM')", 'lastMonth')
      .where('t.userId = :userId', { userId })
      .getRawOne()

    // Si no hay transacciones, usamos el mes actual como fallback
    const now = new Date().toISOString().slice(0, 7)

    return {
      firstMonth: result?.firstMonth || now,
      lastMonth: result?.lastMonth || now,
    }
  }

  /**
   * Registra múltiples movimientos de stock en una sola transacción atómica.
   * Si uno falla, se revierte toda la operación (Rollback).
   */
  async registerMovementsBatch(
    userId: string,
    inputs: RegisterTransactionInput[],
  ): Promise<InventoryTransaction[]> {
    // 🛡️ VALIDACIÓN DE NEGOCIO: Antes de abrir la transacción
    if (inputs.length > this.MAX_OPERATIONAL_BATCH_SIZE) {
      // throw new BadRequestException(
      //   `El lote es demasiado grande. Máximo 50 movimientos, recibidos: ${inputs.length}`,
      // )
      throw new BadRequestException(ItemErrorCode.BATCH_LIMIT_EXCEEDED)
    }
    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()

    try {
      const results: InventoryTransaction[] = []

      for (const input of inputs) {
        // Llamamos al método individual pasando el runner actual
        const transaction = await this.registerMovement(
          userId,
          input,
          runner, // 🔑 Esto garantiza que todos compartan la transacción
        )
        results.push(transaction)
      }

      await runner.commitTransaction()
      return results
    } catch (err) {
      await runner.rollbackTransaction()
      // Re-lanzamos el error original (ej: Insufficient Stock) para que GraphQL lo vea
      throw err
    } finally {
      await runner.release()
    }
  }

  /**
   * Realiza un ajuste manual de stock para un ítem.
   */
  async adjustStock(userId: string, input: AdjustStockInput): Promise<Item> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // CORRECCIÓN 1: Usar this.itemsService.findOne (y pasar los 2 argumentos: id y userId)
      const item = await this.itemsService.findOne(input.itemId, userId)
      if (!item) throw new NotFoundException('Ítem no encontrado.')

      const absoluteQuantity = Math.abs(input.quantity)

      // CORRECCIÓN 2: Llamar a registerMovement del propio servicio (this.registerMovement)
      await this.registerMovement(
        userId,
        {
          itemId: item.id,
          type: input.type,
          quantity: absoluteQuantity,
          documentRef: 'MANUAL-ADJUST',
          notes: input.reason || 'Ajuste manual de inventario.',
          unitCostSnapshot: item.costPrice || 0,
        },
        queryRunner,
      )

      await queryRunner.commitTransaction()

      // CORRECCIÓN 3: Refrescar el item usando el service y el userId
      const updatedItem = await this.itemsService.findOne(item.id, userId)
      return updatedItem!
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  async hasOperationalHistory(
    userId: string,
    itemId: string,
  ): Promise<boolean> {
    const count = await this.transactionRepository.count({
      where: {
        itemId,
        userId,
        // Solo cuenta si hay movimientos que NO sean el inicial
        type: Not(
          In([
            TransactionType.INITIAL_INVENTORY,
            TransactionType.MEASUREMENT_ADJUSTMENT,
          ]),
        ),
      },
    })
    return count > 0
  }
}
