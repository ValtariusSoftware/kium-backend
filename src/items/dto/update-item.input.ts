import { InputType, Field, ID, PartialType, Float } from '@nestjs/graphql'
import { CreateItemInput } from './create-item.dto' // <-- Asegúrate de que esta ruta sea correcta
import { IsUUID } from 'class-validator'
import { BaseUnit } from '../entities/item.entity'

@InputType()
export class UpdateItemInput extends PartialType(CreateItemInput) {
  @Field(() => ID)
  @IsUUID()
  id: string
}

@InputType()
export class BulkUpdateItemInput {
  @Field(() => ID)
  id: string

  @Field({ nullable: true })
  name?: string

  @Field(() => BaseUnit, { nullable: true })
  baseUnit?: BaseUnit

  @Field(() => Float, { nullable: true })
  conversionToBaseQty?: number

  @Field(() => Float, { nullable: true })
  minStockAlert?: number

  @Field(() => Float, { nullable: true })
  costPrice?: number

  @Field(() => Float, { nullable: true })
  salePrice?: number

  @Field({ nullable: true })
  barcode?: string

  @Field({ nullable: true })
  sku?: string
}
