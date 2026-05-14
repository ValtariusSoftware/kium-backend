// sales/sales.service.ts

import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'
import { CreateSaleInput } from './dto/create-sale.input'
import { Between, DataSource, MoreThanOrEqual, Repository } from 'typeorm'
import { Sale } from './entities/sale.entity'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { PaginatedSales } from './dto/paginated-sales.output'
import { ItemErrorCode } from 'src/items/enums/item-error-code.enum'

@Injectable()
export class SalesService {
  private readonly MAX_SALE_ITEMS = 100
  constructor(
    @InjectRepository(Sale)
    private readonly salesRepository: Repository<Sale>,
    private readonly inventoryService: InventoryTransactionsService,
    private readonly dataSource: DataSource,
  ) {}

  async createSale(userId: string, input: CreateSaleInput): Promise<Sale> {
    if (input.items.length > this.MAX_SALE_ITEMS) {
      throw new BadRequestException(ItemErrorCode.BATCH_LIMIT_EXCEEDED)
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. Crear la cabecera de la venta (monto inicial 0 para calcularlo luego)
      const newSale = queryRunner.manager.create(Sale, {
        userId,
        totalAmount: 0,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      })
      const savedSale = await queryRunner.manager.save(newSale)

      let totalSaleAmount = 0
      // 2. Registrar cada producto como un movimiento de inventario vinculado a esta venta
      for (const itemInput of input.items) {
        const transaction = await this.inventoryService.registerMovement(
          userId,
          {
            itemId: itemInput.itemId,
            quantity: itemInput.quantity,
            type: TransactionType.SALE,
            documentRef: `SALE-${savedSale.id.substring(0, 8)}`,
            saleId: savedSale.id, // 👈 VINCULACIÓN CLAVE
            salePriceSnapshot: itemInput.priceOverride,
          },
          queryRunner, // Pasamos el runner para que sea atómico
        )

        // Sumamos al total (cantidad * precio de venta en ese momento)
        // totalSaleAmount +=
        //   Math.abs(Number(transaction.quantity)) *
        //   Number(transaction.salePriceSnapshot)

        // CORRECCIÓN MATEMÁTICA:
        // 1. quantity es decimal (ej: 1.5)
        // 2. salePriceSnapshot es entero (ej: 1000 centavos)
        // 3. Redondeamos el resultado final para asegurar que grabamos ENTEROS (centavos)
        const lineTotal = Math.round(
          Math.abs(Number(transaction.quantity)) *
            Number(transaction.salePriceSnapshot),
        )

        totalSaleAmount += lineTotal
      }

      // 3. Actualizar el monto total real de la venta
      savedSale.totalAmount = totalSaleAmount
      await queryRunner.manager.save(savedSale)

      await queryRunner.commitTransaction()

      const finalSale = await this.salesRepository.findOne({
        where: { id: savedSale.id },
        relations: ['items', 'items.item'],
      })

      if (!finalSale)
        throw new NotFoundException('Error al recuperar la venta creada')
      return finalSale
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  async voidSale(userId: string, saleId: string): Promise<Sale> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. Buscar la venta con sus items
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: saleId, userId },
        relations: ['items'],
      })

      if (!sale) throw new NotFoundException('Venta no encontrada')
      if (sale.isVoided) throw new Error('Esta venta ya ha sido anulada')

      // 2. Por cada item de la venta, crear un movimiento inverso
      for (const transaction of sale.items) {
        await this.inventoryService.registerMovement(
          userId,
          {
            itemId: transaction.itemId,
            quantity: Math.abs(Number(transaction.quantity)), // Si vendió 2 (-2), ahora sumamos 2 (+2)
            type: TransactionType.RETURN_FROM_SALE, // O un nuevo tipo RETURN_FROM_SALE
            documentRef: `VOID-SALE-${sale.id.substring(0, 8)}`,
            notes: `Anulación de venta ${sale.id}`,
            unitCostSnapshot: transaction.unitCostSnapshot, // Usamos el costo que se grabó cuando se vendió
            salePriceSnapshot: transaction.salePriceSnapshot, // Usamos el precio que se grabó cuando se vendió
          },
          queryRunner,
        )
      }

      // 3. Marcar la venta como anulada
      sale.isVoided = true
      const updatedSale = await queryRunner.manager.save(sale)

      await queryRunner.commitTransaction()
      return updatedSale
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Obtiene las ventas realizadas en los últimos 7 días.
   * Este método está optimizado para la vista principal de la App, por lo que:
   * 1. EXCLUYE ventas anuladas (isVoided: true) para mostrar solo ingresos reales.
   * 2. Aplica paginación (limit/offset) para asegurar una carga rápida en el móvil.
   * 3. Ordena cronológicamente empezando por la más reciente.
   * @param userId ID del usuario propietario de las ventas.
   * @param pagination Objeto con limit y offset para el scroll infinito.
   */
  async getRecentSales(
    userId: string,
    pagination: PaginationInput,
  ): Promise<{ sales: Sale[]; total: number }> {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const [sales, total] = await this.salesRepository.findAndCount({
      where: {
        userId,
        createdAt: MoreThanOrEqual(sevenDaysAgo),
        isVoided: false,
      },
      relations: ['items', 'items.item'],
      order: { createdAt: 'DESC' },
      take: pagination.limit, // 👈 Tu 'limit' del DTO
      skip: pagination.offset, // 👈 Tu 'offset' del DTO
    })

    return { sales, total }
  }

  /**
   * Obtiene el historial completo de ventas de una fecha específica.
   * A diferencia de las ventas recientes, este método:
   * 1. INCLUYE ventas anuladas, permitiendo al usuario auditar movimientos fallidos.
   * 2. Filtra estrictamente por el día calendario (desde 00:00:00 hasta 23:59:59).
   * 3. Facilita el control de caja al mostrar todos los documentos generados ese día.
   * @param userId ID del usuario.
   * @param date Fecha a consultar en formato cadena (ej: "2026-01-08").
   * @param pagination Objeto para manejar grandes volúmenes de transacciones por día.
   */
  async getSalesByDate(
    userId: string,
    date: string,
    pagination: PaginationInput,
  ): Promise<PaginatedSales> {
    // Usamos split para evitar que la zona horaria mueva la fecha
    const [year, month, day] = date.split('-').map(Number)
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))

    const [sales, total] = await this.salesRepository.findAndCount({
      where: {
        userId,
        createdAt: Between(startOfDay, endOfDay),
      },
      relations: ['items', 'items.item'],
      order: { createdAt: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    })

    return { sales, total }
  }
}
