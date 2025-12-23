import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, QueryRunner, Between } from 'typeorm'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { RegisterTransactionInput } from './dto/register-transaction.input'
import { Item, ItemType } from '../items/entities/item.entity' // Necesario para actualizar stock
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
        relations: [
          'recipe',
          'recipe.ingredients',
          'recipe.ingredients.ingredientItem',
        ],
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

      // --- 🛡️ BLOQUEO INTELIGENTE Y AUTO-PRODUCCIÓN ---
      if (outTypes.includes(input.type)) {
        const potentialStock = Number(item.stock) + finalQuantity

        if (potentialStock < 0) {
          // Caso A: No se puede producir
          if (item.type !== ItemType.FINAL_PRODUCT || !item.recipe) {
            throw new GraphQLError(
              `Stock insuficiente para ${item.name}. Disponible: ${item.stock}`,
              {
                extensions: {
                  code: 'INSUFFICIENT_STOCK',
                  httpStatus: 400,
                  ingredients: [item.name],
                },
              },
            )
          }

          // Caso B: Es producto final pero no envió permiso
          if (!input.autoProduceIfMissing) {
            // 🛡️ VALIDACIÓN PREVENTIVA: ¿Realmente tiene los ingredientes?
            const factor = Math.abs(potentialStock) / item.recipe.yieldQuantity
            const missingIngredients: string[] = []

            for (const ingredient of item.recipe.ingredients) {
              const stockQtyToConsume =
                (ingredient.quantityRequired * factor) /
                ingredient.ingredientItem.conversionToBaseQty

              if (Number(ingredient.ingredientItem.stock) < stockQtyToConsume) {
                missingIngredients.push(ingredient.ingredientItem.name)
              }
            }

            // Si después de revisar, vemos que le faltan ingredientes,
            // no le ofrecemos "Producir", le decimos directamente que no hay ingredientes.
            if (missingIngredients.length > 0) {
              throw new GraphQLError(
                `No hay stock de ${item.name} y tampoco ingredientes suficientes.`,
                {
                  extensions: {
                    code: 'INSUFFICIENT_INGREDIENTS',
                    httpStatus: 400,
                    ingredients: missingIngredients,
                  },
                },
              )
            }

            // Si llegó acá, es porque SI tiene los ingredientes, entonces sí disparamos el CAN_AUTO_PRODUCE
            throw new GraphQLError(
              `No hay stock de ${item.name}, pero tienes los ingredientes. ¿Fabricar el faltante?`,
              {
                extensions: {
                  code: 'CAN_AUTO_PRODUCE',
                  missing: Math.abs(potentialStock),
                  httpStatus: 400,
                },
              },
            )
          }

          // Caso C: Tiene permiso -> Producimos exactamente lo que falta
          const quantityToProduce = Math.abs(potentialStock)
          await this.itemsService.produce(
            userId,
            {
              recipeId: item.recipe.id,
              quantityToProduce: quantityToProduce,
            },
            runner,
          ) // 🔑 IMPORTANTE: Pasamos el runner para que sea una sola transacción

          const updatedItem = await runner.manager.findOne(Item, {
            where: { id: item.id },
          })

          item.stock = updatedItem!.stock
        }
      }

      // 1. Snapshots
      const unitCostSnapshot =
        input.unitCostSnapshot ?? Number(item.costPrice ?? 0)
      let salePriceSnapshot = 0
      if (input.type === TransactionType.SALE) {
        salePriceSnapshot =
          input.salePriceSnapshot ?? Number(item.salePrice ?? 0)
      }

      // 3. Crear registro
      const newTransaction = runner.manager.create(InventoryTransaction, {
        ...input,
        quantity: finalQuantity,
        userId,
        unitCostSnapshot,
        salePriceSnapshot,
      })

      const savedTransaction = await runner.manager.save(newTransaction)

      // 4. Actualizar Ficha Maestra (si es compra)
      if (
        input.type === TransactionType.PURCHASE ||
        input.type === TransactionType.INITIAL_INVENTORY
      ) {
        await runner.manager.update(
          Item,
          { id: input.itemId },
          { costPrice: unitCostSnapshot },
        )
      }

      // 5. Actualizar stock físico
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

  // Método para obtener el historial de transacciones (útil para el frontend)
  async findAllByItem(
    itemId: string,
    userId: string,
  ): Promise<InventoryTransaction[]> {
    return this.transactionRepository.find({
      where: { itemId, userId },
      order: { createdAt: 'DESC' },
    })
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
    // 1. Consultar todas las transacciones del periodo
    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
    })

    const reportMap = new Map<string, FinancialDataPoint>()

    // 2. Procesar y agrupar
    transactions.forEach((t) => {
      // Definir la etiqueta según la agrupación (Día o Mes)
      const date = new Date(t.createdAt)
      const label =
        groupBy === ReportGroupBy.DAY
          ? date.toISOString().split('T')[0] // Ej: "2025-12-19"
          : `${date.getFullYear()}-${date.getMonth() + 1}` // Ej: "2025-12"

      if (!reportMap.has(label)) {
        reportMap.set(label, {
          label,
          revenue: 0,
          cost: 0,
          losses: 0,
          netProfit: 0,
        })
      }

      const point = reportMap.get(label)!
      const qty = Number(t.quantity)
      const cost = Number(t.unitCostSnapshot)
      const sale = Number(t.salePriceSnapshot || 0)

      if (t.type === TransactionType.SALE) {
        // Venta: Sumamos ingreso bruto y el costo de lo vendido (qty es negativa en SALE)
        point.revenue += Math.abs(qty) * sale
        point.cost += Math.abs(qty) * cost
      } else if (
        t.type === TransactionType.ADJUSTMENT_OUT ||
        t.type === TransactionType.CONSUMPTION
      ) {
        // Pérdida: Mercadería que salió sin venderse
        point.losses += Math.abs(qty) * cost
      }

      // El neto siempre es: lo que entró - lo que costó producirlo - lo que se tiró
      point.netProfit = point.revenue - point.cost - point.losses
    })

    const data = Array.from(reportMap.values())
    const totalNetProfit = data.reduce((sum, p) => sum + p.netProfit, 0)

    return { data, totalNetProfit }
  }
}
