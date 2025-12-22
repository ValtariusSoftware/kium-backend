// inventory-transactions/dto/transaction-history.output.ts
import { ObjectType, Field, Float, ID } from '@nestjs/graphql'
import { TransactionType } from '../enums/transaction-type.enum'

@ObjectType()
export class TransactionHistoryItem {
  @Field(() => ID)
  id: string

  @Field(() => TransactionType)
  type: TransactionType

  @Field(() => Float)
  quantity: number

  @Field(() => Float)
  unitCostSnapshot: number

  @Field(() => Float, { nullable: true })
  salePriceSnapshot?: number

  @Field({ nullable: true })
  documentRef?: string

  @Field({ nullable: true })
  notes?: string

  @Field()
  createdAt: Date
}
