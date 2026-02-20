import { InputType, Field, ID, Float } from '@nestjs/graphql'
import { IsOptional, IsUUID } from 'class-validator'
import { BaseUnit } from '../entities/item.entity'

@InputType()
export class UpdateItemInput {
  @Field(() => ID)
  @IsUUID()
  id: string

  @Field({ nullable: true })
  @IsOptional()
  name?: string

  @Field(() => BaseUnit, { nullable: true })
  @IsOptional()
  baseUnit?: BaseUnit

  @Field(() => Float, { nullable: true })
  @IsOptional()
  conversionToBaseQty?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  minStockAlert?: number

  // ❌ COSTPRICE ELIMINADO: Se actualiza vía compras
  // ❌ STOCK ELIMINADO: Se actualiza vía movimientos

  @Field(() => Float, { nullable: true })
  @IsOptional()
  salePrice?: number // El precio de venta sí es catálogo (decisión comercial)

  @Field({ nullable: true })
  @IsOptional()
  barcode?: string

  @Field({ nullable: true })
  @IsOptional()
  sku?: string
}

@InputType()
export class BulkUpdateItemInput {
  @Field(() => ID)
  id: string

  @Field({ nullable: true })
  name?: string

  // @Field(() => BaseUnit, { nullable: true })
  // baseUnit?: BaseUnit

  // @Field(() => Float, { nullable: true })
  // conversionToBaseQty?: number

  @Field(() => Float, { nullable: true })
  minStockAlert?: number

  @Field(() => Float, { nullable: true })
  salePrice?: number

  @Field({ nullable: true })
  barcode?: string

  @Field({ nullable: true })
  sku?: string
}
