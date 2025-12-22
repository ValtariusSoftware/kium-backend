import { InputType, Field, Float, ID } from '@nestjs/graphql'
import {
  IsUUID,
  IsIn,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { TransactionType } from '../enums/transaction-type.enum'

@InputType()
export class RegisterTransactionInput {
  @Field(() => ID, { description: 'ID del Item afectado por la transacción.' })
  @IsUUID()
  itemId: string

  @Field(() => TransactionType, {
    description: 'Tipo de movimiento (PURCHASE, SALE, ADJUSTMENT_OUT, etc.).',
  })
  @IsIn(Object.values(TransactionType))
  type: TransactionType

  @Field(() => Float, {
    description:
      'Cantidad del movimiento. Positivo para entrada, Negativo para salida.',
  })
  @IsNumber()
  @Min(-9999999.9999, { message: 'La cantidad debe ser un número válido.' }) // Acepta negativos grandes
  quantity: number

  @Field(() => Float, {
    description:
      'Costo unitario del ítem en esta transacción. Obligatorio para entradas de costo (PURCHASE).',
    nullable: true,
  })
  @IsNumber()
  @IsPositive({ message: 'El costo unitario debe ser positivo.' })
  @IsOptional()
  unitCostSnapshot?: number

  @Field(() => Float, {
    description:
      'Precio de venta unitario. Obligatorio para transacciones de tipo SALE.',
    nullable: true,
  })
  @IsNumber()
  @IsOptional()
  salePriceSnapshot?: number

  @Field({
    nullable: true,
    description: 'Referencia a documento (Factura, Recibo, ID de Venta, etc.).',
  })
  @IsString()
  @IsOptional()
  documentRef?: string

  @Field({
    nullable: true,
    description:
      'Notas u observación para el movimiento (ej. Razón de ajuste).',
  })
  @IsString()
  @IsOptional()
  notes?: string
}
