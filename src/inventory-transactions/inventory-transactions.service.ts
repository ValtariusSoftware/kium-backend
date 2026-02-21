import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, QueryRunner, Not } from 'typeorm'
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
import { GraphQLError } from 'graphql'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { RecipesService } from 'src/recipes/recipes.service'
import { PaginationInput } from 'src/common/dto/pagination.input'

@Injectable()
export class InventoryTransactionsService {
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

      if (!item) {
        throw new NotFoundException(
          `Item con ID ${input.itemId} no encontrado.`,
        )
      }

      // --- 0. NORMALIZACIÓN DE CANTIDAD ---
      const outTypes = [
        TransactionType.SALE,
        TransactionType.ADJUSTMENT_OUT,
        TransactionType.CONSUMPTION,
      ]

      const finalQuantity = outTypes.includes(input.type)
        ? -Math.abs(input.quantity)
        : Math.abs(input.quantity)

      // --- 🛡️ VALIDACIÓN DE STOCK SIMPLE ---
      if (outTypes.includes(input.type)) {
        const potentialStock = Number(item.stock) + finalQuantity

        if (potentialStock < 0) {
          throw new GraphQLError(
            `Stock insuficiente para ${item.name}. Disponible: ${item.stock}`,
            {
              extensions: {
                code: 'INSUFFICIENT_STOCK',
                httpStatus: 400,
                available: item.stock,
              },
            },
          )
        }
      }

      // --- 1. SNAPSHOTS (CORREGIDO) ---
      // El costo: Si viene en el input se usa, sino el de la ficha maestra
      const unitCostSnapshot =
        input.unitCostSnapshot ?? Number(item.costPrice ?? 0)

      // El precio de venta:
      // 1. Prioridad: Lo que viene por input (crucial para anulaciones y overrides)
      // 2. Si es una VENTA y no viene input: Usamos el de la ficha maestra
      // 3. Caso contrario: 0
      let salePriceSnapshot = input.salePriceSnapshot ?? 0

      if (input.type === TransactionType.SALE && !input.salePriceSnapshot) {
        salePriceSnapshot = Number(item.salePrice ?? 0)
      }

      // 2. Crear registro
      const newTransaction = runner.manager.create(InventoryTransaction, {
        ...input,
        quantity: finalQuantity,
        userId,
        unitCostSnapshot,
        salePriceSnapshot,
      })

      const savedTransaction = await runner.manager.save(newTransaction)

      // --- 3. Actualizar Ficha Maestra (Solo para compras o inventario inicial) ---
      const isPurchase =
        input.type === TransactionType.PURCHASE ||
        input.type === TransactionType.INITIAL_INVENTORY
      const priceWasProvided =
        input.unitCostSnapshot !== undefined && input.unitCostSnapshot !== null

      if (isPurchase && priceWasProvided) {
        if (!item.isProduced) {
          // CASO A: Es un insumo o producto de reventa -> ACTUALIZAMOS TODO
          await runner.manager.update(
            Item,
            { id: input.itemId },
            { costPrice: unitCostSnapshot },
          )

          if (item.isIngredient) {
            await this.recipesService.syncRecipeCostsByIngredient(
              userId,
              item.id,
              runner,
            )
          }
        } else {
          // CASO B: Es producido -> El stock sube, pero el costo maestro NO se toca
          // porque el costo maestro de un producido depende de su receta, no de una carga manual.
          console.log(
            `[Inventory] Se omitió actualización de costo maestro para "${item.name}" por ser producto producido.`,
          )
        }
      }

      // 4. Actualizar stock físico
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

  async getFinancialReport(
    userId: string,
    startDate: Date,
    endDate: Date,
    groupBy: ReportGroupBy,
  ): Promise<FinancialReportResponse> {
    const dateTrunc = groupBy === ReportGroupBy.DAY ? 'day' : 'month'
    const format = groupBy === ReportGroupBy.DAY ? 'YYYY-MM-DD' : 'YYYY-MM'

    const results = await this.transactionRepository
      .createQueryBuilder('t')
      .select(
        `TO_CHAR(DATE_TRUNC('${dateTrunc}', t.createdAt), '${format}')`,
        'label',
      )
      .addSelect(
        `SUM(
          CASE 
            WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.salePriceSnapshot 
            WHEN t.type = 'RETURN_FROM_SALE' THEN -ABS(t.quantity) * t.salePriceSnapshot 
            ELSE 0 
          END
        )`,
        'revenue',
      )
      .addSelect(
        `SUM(
          CASE 
            WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.unitCostSnapshot 
            WHEN t.type = 'RETURN_FROM_SALE' THEN -ABS(t.quantity) * t.unitCostSnapshot 
            ELSE 0 
          END
        )`,
        'cost',
      )
      .addSelect(
        `SUM(CASE WHEN t.type IN ('ADJUSTMENT_OUT', 'CONSUMPTION') THEN ABS(t.quantity) * t.unitCostSnapshot ELSE 0 END)`,
        'losses',
      )
      .where('t.userId = :userId', { userId })
      .andWhere('t.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy(`TO_CHAR(DATE_TRUNC('${dateTrunc}', t.createdAt), '${format}')`)
      .orderBy('label', 'ASC')
      .getRawMany()

    const data: FinancialDataPoint[] = results.map((r) => ({
      label: r.label,
      revenue: Number(r.revenue || 0),
      cost: Number(r.cost || 0),
      losses: Number(r.losses || 0),
      netProfit:
        Math.round(
          (Number(r.revenue || 0) -
            Number(r.cost || 0) -
            Number(r.losses || 0)) *
            100,
        ) / 100,
    }))

    const totalNetProfit =
      Math.round(data.reduce((sum, p) => sum + p.netProfit, 0) * 100) / 100

    return { data, totalNetProfit }
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
    if (inputs.length > 50) {
      throw new BadRequestException(
        `El lote es demasiado grande. Máximo 50 movimientos, recibidos: ${inputs.length}`,
      )
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
        type: Not(TransactionType.INITIAL_INVENTORY),
      },
    })
    return count > 0
  }
}
