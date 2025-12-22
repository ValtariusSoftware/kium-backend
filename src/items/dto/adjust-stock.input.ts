import { InputType, Field, ID, Float } from '@nestjs/graphql'
import { IsUUID, IsNumber, IsString, IsOptional, IsEnum } from 'class-validator'
import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'

@InputType()
export class AdjustStockInput {
  @Field(() => ID)
  @IsUUID()
  itemId: string

  @Field(() => Float)
  @IsNumber()
  // Puede ser positivo (encontré stock) o negativo (se rompió/perdió)
  quantity: number

  @Field(() => TransactionType)
  @IsEnum(TransactionType)
  type: TransactionType

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  reason?: string
}
