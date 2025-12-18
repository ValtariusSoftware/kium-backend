import { Resolver, Mutation, Args, Query, ID } from '@nestjs/graphql'
import { InventoryTransactionsService } from './inventory-transactions.service'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { RegisterTransactionInput } from './dto/register-transaction.input'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { User } from 'src/users/entities/user.entity'
import { TransactionHistoryItem } from './dto/transaction-history.output'

@Resolver(() => InventoryTransaction)
export class InventoryTransactionsResolver {
  constructor(
    private readonly inventoryTransactionsService: InventoryTransactionsService,
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

  // QUERY para ver el historial de un Item específico
  @Query(() => [InventoryTransaction], { name: 'inventoryTransactionsByItem' })
  findAllByItem(
    @Args('itemId', { type: () => ID }) itemId: string,
    @CurrentUser() user: User,
  ): Promise<InventoryTransaction[]> {
    return this.inventoryTransactionsService.findAllByItem(itemId, user.id)
  }

  @Query(() => [TransactionHistoryItem], { name: 'itemTransactionHistory' })
  async getHistory(
    @Args('itemId', { type: () => ID }) itemId: string,
    @CurrentUser() user: User, // Tu decorador de usuario
  ): Promise<InventoryTransaction[]> {
    return this.inventoryTransactionsService.findByItem(itemId, user.id)
  }
}
