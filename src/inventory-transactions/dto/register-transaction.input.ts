import { InputType, Field, Float, ID } from '@nestjs/graphql'
import {
  IsUUID,
  IsIn,
  IsNumber,
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

  // @Field(() => Float, { nullable: true })
  // @IsNumber()
  // @IsPositive()
  // @IsOptional()
  // @Transform(({ value }) =>
  //   value ? Number(parseFloat(value).toFixed(2)) : value,
  // ) // 👈 Costo: 2 decimales
  // unitCostSnapshot?: number

  // @Field(() => Float, { nullable: true })
  // @IsNumber()
  // @IsOptional()
  // @Transform(({ value }) =>
  //   value ? Number(parseFloat(value).toFixed(2)) : value,
  // ) // 👈 Precio: 2 decimales
  // salePriceSnapshot?: number

  // EL CAMBIO: Costo y Precio ahora vienen como Enteros (Centavos)
  @Field(() => Float, { nullable: true }) // Mantenemos Float en GraphQL por compatibilidad
  @IsNumber()
  @Min(0) // Usamos Min(0) en lugar de IsPositive por si algo cuesta 0
  @IsOptional()
  @Transform(({ value }) => Math.round(value)) // 👈 Nos aseguramos de que sea un entero
  unitCostSnapshot?: number

  @Field(() => Float, { nullable: true })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => Math.round(value)) // 👈 Nos aseguramos de que sea un entero
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
