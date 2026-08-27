import { InputType, Field, Float, ObjectType, Int } from '@nestjs/graphql'
import {
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsString,
  Min,
  IsOptional,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { BaseUnit, Item, ItemType } from '../entities/item.entity'
import { ProductType } from '../enums/product-type'

@InputType()
export class CreateItemInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string

  @Field(() => Float, { nullable: true, defaultValue: 0 }) // En GraphQL es opcional
  @IsOptional() // class-validator permite que no venga
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => {
    if (value === null || value === undefined) return 0 // Si no viene, forzamos 0
    return Number(parseFloat(value).toFixed(4))
  })
  stock: number

  @Field(() => BaseUnit)
  @IsEnum(BaseUnit)
  baseUnit: BaseUnit

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001)
  @Transform(({ value }) => Number(parseFloat(value).toFixed(4)))
  conversionToBaseQty: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) =>
    value ? Number(parseFloat(value).toFixed(2)) : value,
  ) // 👈 Precios a 2
  minStockAlert?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? Math.round(value) : value)) // 👈 A centavos
  costPrice?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value ? Math.round(value) : value)) // 👈 A centavos
  salePrice?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  sku?: string

  @Field(() => Boolean, { nullable: true, defaultValue: false })
  @IsOptional()
  isInitialized?: boolean

  @Field(() => String, { nullable: true, defaultValue: ProductType.RESALE })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType

  @Field(() => ItemType, { nullable: true, defaultValue: ItemType.PRODUCT })
  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType
}

@ObjectType()
export class BulkItemError {
  @Field(() => Int)
  row: number // El número de fila donde ocurrió el error

  @Field()
  name: string // El nombre del producto que falló

  @Field()
  error: string // El mensaje de error amigable (ej: "SKU duplicado")

  // Agregamos este campo opcional
  @Field(() => [String], { nullable: true })
  details?: string[]
}

@ObjectType()
export class BulkItemResponse {
  @Field(() => [Item])
  created: Item[] // Lista de ítems que sí se guardaron correctamente

  @Field(() => [BulkItemError])
  errors: BulkItemError[] // Lista de fallos con su detalle
}
