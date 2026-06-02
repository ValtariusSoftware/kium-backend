import { InputType, Field, ID, Float, ObjectType } from '@nestjs/graphql'
import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator'
import { BaseUnit, Item } from '../entities/item.entity'
import { Transform } from 'class-transformer'

@InputType()
export class UpdateItemInput {
  @Field(() => ID)
  @IsUUID()
  id: string

  @Field({ nullable: true })
  @IsOptional()
  name?: string

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

  @Field(() => Float, { nullable: true })
  minStockAlert?: number

  // @Field(() => Float, { nullable: true })
  // salePrice?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? Math.round(value) : value)) // 👈 A centavos
  salePrice?: number

  @Field({ nullable: true })
  barcode?: string

  @Field({ nullable: true })
  sku?: string
}

@InputType()
export class ReconfigureItemInput {
  @Field(() => ID)
  @IsUUID()
  id: string

  @Field(() => BaseUnit) // Aquí suelen ser obligatorios porque definen la nueva estructura
  @IsEnum(BaseUnit)
  baseUnit: BaseUnit

  @Field(() => BaseUnit)
  @IsEnum(BaseUnit)
  purchaseUnit: BaseUnit

  @Field(() => Float)
  @IsNumber()
  conversionToBaseQty: number
}

@ObjectType()
export class ReconfigureItemResponse {
  @Field(() => Item)
  item: Item

  @Field(() => [ID], { nullable: true })
  affectedRecipeIds?: string[] // IDs de recetas que requieren actualización
}
