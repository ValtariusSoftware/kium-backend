// inventory-transactions/dto/paginated-transactions.output.ts
import { ObjectType, Field, Int } from '@nestjs/graphql'
import { TransactionHistoryItem } from './transaction-history.output'

@ObjectType()
export class PaginatedTransactions {
  @Field(() => [TransactionHistoryItem])
  transactions: TransactionHistoryItem[]

  @Field(() => Int)
  total: number
}
