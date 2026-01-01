import { InputType, Field, Float } from '@nestjs/graphql'
import {
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsString,
  Min,
  IsOptional,
} from 'class-validator'
import { BaseUnit } from '../entities/item.entity'

@InputType()
export class CreateItemInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  stock: number

  @Field(() => BaseUnit)
  @IsEnum(BaseUnit)
  baseUnit: BaseUnit

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001) // La conversión debe ser mayor a cero
  conversionToBaseQty: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockAlert?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string

  @Field({ nullable: true }) // El SKU es opcional para el usuario, pero lo usamos como llave
  @IsOptional()
  @IsString()
  sku?: string
}
