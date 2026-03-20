// sales/dto/create-sale.input.ts (Se mantiene igual)
import { InputType, Field, Float } from '@nestjs/graphql'
import { Transform } from 'class-transformer'
import { IsArray, IsUUID, IsNumber, Min, IsOptional } from 'class-validator'

@InputType()
export class SaleItemInput {
  @Field(() => String)
  @IsUUID()
  itemId: string

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001) // Permitimos vender fracciones (ej: 0.5kg de pan)
  @Transform(({ value }) => Number(parseFloat(value).toFixed(4)))
  quantity: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) =>
    value ? Number(parseFloat(value).toFixed(2)) : value,
  )
  priceOverride?: number
}

@InputType()
export class CreateSaleInput {
  @Field(() => [SaleItemInput])
  @IsArray()
  items: SaleItemInput[]

  @Field(() => String, { defaultValue: 'CASH' })
  paymentMethod: string

  @Field({ nullable: true })
  notes?: string
}
