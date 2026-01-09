import {
  Resolver,
  Mutation,
  Args,
  Query,
  ID,
  ResolveField,
  Parent,
} from '@nestjs/graphql'
import { InventoryTransactionsService } from './inventory-transactions.service'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { RegisterTransactionInput } from './dto/register-transaction.input'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { User } from 'src/users/entities/user.entity'
import { TransactionHistoryItem } from './dto/transaction-history.output'
import { FinancialReportResponse } from './dto/financial-report.output'
import { ReportGroupBy } from './enums/report-group-by.enum'
import { ItemsService } from 'src/items/items.service'
import { Item } from 'src/items/entities/item.entity'
import { NotFoundException } from '@nestjs/common'

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

  @Query(() => [TransactionHistoryItem], { name: 'itemTransactionHistory' })
  async getHistory(
    @Args('itemId', { type: () => ID }) itemId: string,
    @CurrentUser() user: User, // Tu decorador de usuario
  ): Promise<InventoryTransaction[]> {
    return this.inventoryTransactionsService.findByItem(itemId, user.id)
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
    @CurrentUser() user: User,
  ): Promise<Item> {
    const item = await this.itemsService.findOne(transaction.itemId, user.id)
    if (!item) {
      throw new NotFoundException(
        'El ítem asociado a esta transacción ya no existe.',
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
}
