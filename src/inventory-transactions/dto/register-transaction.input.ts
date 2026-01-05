import { InputType, Field, Float, ID } from '@nestjs/graphql'
import {
  IsUUID,
  IsIn,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  Min,
  IsBoolean,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { TransactionType } from '../enums/transaction-type.enum'

@InputType()
export class RegisterTransactionInput {
  @Field(() => ID)
  @IsUUID()
  itemId: string

  @Field(() => TransactionType)
  @IsIn(Object.values(TransactionType))
  type: TransactionType

  @Field(() => Float)
  @IsNumber()
  @Min(-9999999.9999)
  @Transform(({ value }) => Number(parseFloat(value).toFixed(4))) // 👈 Cantidad: 4 decimales
  quantity: number

  @Field(() => Float, { nullable: true })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) =>
    value ? Number(parseFloat(value).toFixed(2)) : value,
  ) // 👈 Costo: 2 decimales
  unitCostSnapshot?: number

  @Field(() => Float, { nullable: true })
  @IsNumber()
  @IsOptional()
  @Transform(({ value }) =>
    value ? Number(parseFloat(value).toFixed(2)) : value,
  ) // 👈 Precio: 2 decimales
  salePriceSnapshot?: number

  @Field({ nullable: true, defaultValue: false })
  @IsBoolean()
  @IsOptional()
  autoProduceIfMissing?: boolean

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  documentRef?: string

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  notes?: string

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  saleId?: string
}
