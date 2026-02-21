import {
  Resolver,
  Mutation,
  Args,
  Query,
  ID,
  ResolveField,
  Parent,
  Context,
} from '@nestjs/graphql'
import { InventoryTransactionsService } from './inventory-transactions.service'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { RegisterTransactionInput } from './dto/register-transaction.input'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { User } from 'src/users/entities/user.entity'
import { FinancialReportResponse } from './dto/financial-report.output'
import { ReportGroupBy } from './enums/report-group-by.enum'
import { ItemsService } from 'src/items/items.service'
import { Item } from 'src/items/entities/item.entity'
import { NotFoundException } from '@nestjs/common'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { PaginatedTransactions } from './dto/paginated-transactions.output'
import { ItemsLoader } from 'src/items/items.loader'

@Resolver(() => InventoryTransaction)
export class InventoryTransactionsResolver {
  constructor(
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly itemsService: ItemsService,
  ) {}

  // 🔑 MUTATION GENÉRICA para registrar cualquier movimiento
  @Mutation(() => InventoryTransaction, {
    description:
      'Registra un movimiento de stock (Compra, Venta, Ajuste, Producción) y actualiza el stock total del Item.',
  })
  registerInventoryMovement(
    @Args('registerTransactionInput')
    registerTransactionInput: RegisterTransactionInput,
    @CurrentUser() user: User,
  ): Promise<InventoryTransaction> {
    // El service se encarga de la atomicidad
    return this.inventoryTransactionsService.registerMovement(
      user.id,
      registerTransactionInput,
    )
  }

  @Query(() => PaginatedTransactions, { name: 'itemTransactionHistory' }) // <-- Cambia el tipo de retorno
  async getHistory(
    @Args('itemId', { type: () => ID }) itemId: string,
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput, // <-- Nuevo Args
  ): Promise<PaginatedTransactions> {
    // Usamos los valores por defecto si no vienen en la consulta
    const nav = pagination || new PaginationInput()

    const { transactions, total } =
      await this.inventoryTransactionsService.findByItem(itemId, user.id, nav)

    return { transactions, total }
  }

  @Query(() => FinancialReportResponse, { name: 'financialReport' })
  async getFinancialReport(
    @Args('startDate') startDate: Date,
    @Args('endDate') endDate: Date,
    @Args('groupBy', { type: () => ReportGroupBy }) groupBy: ReportGroupBy,
    @CurrentUser() user: User,
  ): Promise<FinancialReportResponse> {
    return this.inventoryTransactionsService.getFinancialReport(
      user.id,
      startDate,
      endDate,
      groupBy,
    )
  }

  @ResolveField(() => Item, { name: 'item' })
  async getItem(
    @Parent() transaction: InventoryTransaction,
    @Context('itemsLoader') itemsLoader: ItemsLoader,
  ): Promise<Item> {
    // 🛡️ PLAN B: Si el loader no está en el contexto (común en pruebas/playground),
    // usamos el service directamente para no romper la respuesta.
    if (!itemsLoader) {
      const item = await this.itemsService.findOne(
        transaction.itemId,
        transaction.userId,
      )
      if (!item) {
        throw new NotFoundException(
          `El ítem con ID ${transaction.itemId} no existe (Plan B).`,
        )
      }
      return item
    }

    // PLAN A: Usar el loader (Eficiencia en producción)
    const item = await itemsLoader.load(transaction.itemId)

    if (!item) {
      throw new NotFoundException(
        `El ítem con ID ${transaction.itemId} asociado a esta transacción no existe.`,
      )
    }
    return item
  }

  @Mutation(() => [InventoryTransaction], {
    name: 'registerInventoryMovements',
    description: 'Registra múltiples movimientos de stock de forma atómica.',
  })
  async registerInventoryMovements(
    @Args({
      name: 'registerTransactionInputs',
      type: () => [RegisterTransactionInput],
    })
    inputs: RegisterTransactionInput[],
    @CurrentUser() user: User, // Asumiendo que tienes este decorador
  ): Promise<InventoryTransaction[]> {
    return this.inventoryTransactionsService.registerMovementsBatch(
      user.id,
      inputs,
    )
  }

  @Mutation(() => Item, { name: 'adjustItemStock' })
  async adjustStock(
    @Args('adjustStockInput') adjustStockInput: AdjustStockInput,
    @CurrentUser() user: User,
  ): Promise<Item> {
    // CAMBIO: Ahora llama al servicio de inventario, que es donde moviste la lógica
    return this.inventoryTransactionsService.adjustStock(
      user.id,
      adjustStockInput,
    )
  }
}
