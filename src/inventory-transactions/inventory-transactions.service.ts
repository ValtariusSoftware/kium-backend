import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, QueryRunner } from 'typeorm'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { RegisterTransactionInput } from './dto/register-transaction.input'
import { Item } from '../items/entities/item.entity' // Necesario para actualizar stock

@Injectable()
export class InventoryTransactionsService {
  constructor(
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly dataSource: DataSource, // Para manejar la transacción atómica
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
      await runner.startTransaction() // Si no es una transacción anidada, inicia una
    }

    try {
      // 1. Verificar la existencia del ítem
      const item = await runner.manager.findOne(Item, {
        where: { id: input.itemId, userId },
      })
      if (!item) {
        throw new NotFoundException(
          `Item con ID ${input.itemId} no encontrado.`,
        )
      }

      // 2. Determinar el costo unitario a registrar (unitCostSnapshot)
      // Lógica simplificada: para entradas (PURCHASE/INITIAL), usa el costo del input; para salidas (SALE/CONSUMPTION), deberías usar lógica FIFO/Promedio
      // Por ahora, asumiremos que si no se da un costo (ej. en una venta), se toma del item, o se registra 0.
      const unitCostSnapshot = input.unitCostSnapshot ?? item.costPrice ?? 0

      // 3. Crear y guardar el registro de la transacción
      const newTransaction = runner.manager.create(InventoryTransaction, {
        ...input,
        userId,
        unitCostSnapshot,
      })
      const savedTransaction = await runner.manager.save(newTransaction)

      // 4. Actualizar el stock del ítem (la columna 'stock' de la tabla 'items')
      // El quantity puede ser positivo (entrada) o negativo (salida)
      await runner.manager.increment(
        Item,
        { id: input.itemId },
        'stock',
        input.quantity,
      )

      // 5. Confirmar si la transacción fue independiente
      if (!externalRunner) {
        await runner.commitTransaction()
      }

      return savedTransaction
    } catch (err) {
      if (!externalRunner) {
        await runner.rollbackTransaction()
      }
      throw err
    } finally {
      if (!externalRunner) {
        await runner.release()
      }
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

  // Más métodos: generar reportes, calcular costos (FIFO/Promedio) se añadirían aquí
}
