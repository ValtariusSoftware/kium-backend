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
  // 2. Método auxiliar para generar datos de prueba
  private generateMockData(
    startDate: Date,
    endDate: Date,
  ): FinancialReportResponse {
    const fullHistory = [
      {
        label: '2025-02',
        revenue: 100000,
        cost: 20000,
        losses: 10000,
        netProfit: 70000,
      },
      {
        label: '2025-03',
        revenue: 135000,
        cost: 17328,
        losses: 37352.2,
        netProfit: 80319.8,
      },
      {
        label: '2025-04',
        revenue: 100000,
        cost: 20000,
        losses: 10000,
        netProfit: 70000,
      },
      {
        label: '2025-05',
        revenue: 120000,
        cost: 25000,
        losses: 5000,
        netProfit: 90000,
      },
      {
        label: '2025-06',
        revenue: 100000,
        cost: 20000,
        losses: 10000,
        netProfit: 70000,
      },
      {
        label: '2025-07',
        revenue: 135000,
        cost: 17328,
        losses: 37352.2,
        netProfit: 80319.8,
      },
      {
        label: '2025-08',
        revenue: 100000,
        cost: 20000,
        losses: 10000,
        netProfit: 70000,
      },
      {
        label: '2025-09',
        revenue: 120000,
        cost: 25000,
        losses: 5000,
        netProfit: 90000,
      },
      {
        label: '2025-10',
        revenue: 100000,
        cost: 20000,
        losses: 10000,
        netProfit: 70000,
      },
      {
        label: '2025-11',
        revenue: 120000,
        cost: 25000,
        losses: 5000,
        netProfit: 90000,
      },
      {
        label: '2025-12',
        revenue: 0,
        cost: 0,
        losses: 0,
        netProfit: 0,
      },
      {
        label: '2026-01',
        revenue: 0,
        cost: 0,
        losses: 0,
        netProfit: 0,
      },
      {
        label: '2026-02',
        revenue: 0,
        cost: 0,
        losses: 0,
        netProfit: 0,
      },
      {
        label: '2026-03',
        revenue: 135000,
        cost: 17328,
        losses: 37352.2,
        netProfit: 80319.8,
      },
    ]

    const data = fullHistory.filter(
      (h) =>
        h.label >= startDate.toISOString().slice(0, 7) &&
        h.label <= endDate.toISOString().slice(0, 7),
    )

    const totalNet = data.reduce((sum, p) => sum + p.netProfit, 0)
    const divisor = Math.min(data.length, 6)
    const avgProfit = divisor > 0 ? totalNet / divisor : 0

    return {
      data,
      avgProfit: Math.round(avgProfit * 100) / 100,
      range: {
        start: startDate.toISOString().slice(0, 7),
        end: endDate.toISOString().slice(0, 7),
      },
    }
  }

  async getFinancialReport(
    userId: string,
    startDate: Date,
    endDate: Date,
    groupBy: ReportGroupBy,
  ): Promise<FinancialReportResponse> {
    const dateTrunc = groupBy === ReportGroupBy.DAY ? 'day' : 'month'
    const format = groupBy === ReportGroupBy.DAY ? 'YYYY-MM-DD' : 'YYYY-MM'
    // console.log('DEBUG: Rango recibido -> Start:', startDate, 'End:', endDate)
    // 🚨 FORZAR MOCK DATA
    // const useMock = true // Cambia a false cuando quieras volver a la DB real
    // if (useMock) {
    //   return this.generateMockData(startDate, endDate)
    // }
    // ... lógica de mock y truncado igual ...

    const results = await this.transactionRepository
      .createQueryBuilder('t')
      .innerJoin('t.item', 'item')
      .select(
        `TO_CHAR(DATE_TRUNC('${dateTrunc}', t.createdAt), '${format}')`,
        'label',
      )
      // Los SUM aquí operan sobre centavos (BigInt)
      .addSelect(
        `SUM(CASE 
          WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.salePriceSnapshot 
          WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.salePriceSnapshot 
          ELSE 0 END)`,
        'revenue',
      )
      .addSelect(
        `SUM(CASE 
          WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.unit_cost_snapshot 
          WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.unit_cost_snapshot 
          WHEN t.type IN ('CONSUMPTION', 'PRODUCTION_OUT') THEN ABS(t.quantity) * t.unit_cost_snapshot 
          ELSE 0 END)`,
        'cost',
      )
      .addSelect(
        `SUM(CASE 
          WHEN t.type = 'ADJUSTMENT_OUT' THEN ABS(t.quantity) * t.unit_cost_snapshot
          ELSE 0 END)`,
        'losses',
      )
      .where('t.userId = :userId', { userId })
      .leftJoin('t.sale', 'sale')
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
      .andWhere('t.createdAt >= :startDate', { startDate })
      .andWhere('t.createdAt < :nextDay', {
        nextDay: new Date(new Date(endDate).getTime() + 86400000),
      })
      .groupBy(`TO_CHAR(DATE_TRUNC('${dateTrunc}', t.createdAt), '${format}')`)
      .orderBy('label', 'ASC')
      .getRawMany()

    const data: FinancialDataPoint[] = results.map((r) => {
      // 1. Limpiamos el string de Postgres: nos quedamos con la parte entera antes del punto
      // Postgres devuelve algo como "32780000.0000"
      const cleanRevenue = (r.revenue || '0').split('.')[0]
      const cleanCost = (r.cost || '0').split('.')[0]
      const cleanLosses = (r.losses || '0').split('.')[0]

      // 2. Ahora sí, convertimos a BigInt con seguridad
      const rev = BigInt(cleanRevenue)
      const cst = BigInt(cleanCost)
      const los = BigInt(cleanLosses)

      // 3. Operación con BigInt
      const netProfitBig = rev - cst - los

      return {
        label: r.label,
        revenue: Number(rev),
        cost: Number(cst),
        losses: Number(los),
        netProfit: Number(netProfitBig),
      }
    })

    // Totales
    const totalNetBig = data.reduce(
      (sum, p) => sum + BigInt(p.netProfit),
      BigInt(0),
    )

    const divisor = data.length > 0 ? Math.min(data.length, 6) : 1

    // El promedio sí suele llevar decimales, pero como devolvemos centavos enteros:
    const avgProfit = Number(totalNetBig) / divisor

    return {
      data,
      avgProfit: Math.round(avgProfit), // Mantenemos el promedio en centavos enteros
      range: {
        start: startDate.toISOString().slice(0, 7),
        end: endDate.toISOString().slice(0, 7),
      },
    }
  }
  /**
   * Verifica la primer transaccion a la db.
   *
   */
  async getUserStatsMetadata(userId: string): Promise<UserStatsMetadata> {
    // const useMock = true

    // if (useMock) {
    //   return {
    //     firstMonth: '2025-02', // Inicio de tu fullHistory mockeado
    //     lastMonth: '2026-03', // Fin de tu fullHistory mockeado
    //   }
    // }
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
