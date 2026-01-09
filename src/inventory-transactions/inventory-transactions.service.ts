import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, QueryRunner } from 'typeorm'
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

@Injectable()
export class InventoryTransactionsService {
  constructor(
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly dataSource: DataSource, // Para manejar la transacción atómica
    @Inject(forwardRef(() => ItemsService)) // 👈 Importante para evitar dependencia circular
    private readonly itemsService: ItemsService,
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

      // 3. Actualizar Ficha Maestra (Solo para compras o inventario inicial)
      if (
        (input.type === TransactionType.PURCHASE ||
          input.type === TransactionType.INITIAL_INVENTORY) &&
        unitCostSnapshot > 0
      ) {
        await runner.manager.update(
          Item,
          { id: input.itemId },
          { costPrice: unitCostSnapshot },
        )
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
  ): Promise<InventoryTransaction[]> {
    return this.transactionRepository.find({
      where: { itemId, userId },
      order: { createdAt: 'DESC' }, // El más reciente primero
    })
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
}
