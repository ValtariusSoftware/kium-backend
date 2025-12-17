import { ObjectType, Field } from '@nestjs/graphql'
import { InventoryTransaction } from '../entities/inventory-transaction.entity'

@ObjectType()
export class TransactionResponse {
  @Field(() => InventoryTransaction)
  transaction: InventoryTransaction
}
