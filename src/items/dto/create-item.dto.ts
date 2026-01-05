import { InputType, Field, Float } from '@nestjs/graphql'
import {
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsString,
  Min,
  IsOptional,
} from 'class-validator'
import { Transform } from 'class-transformer'
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
  @Transform(({ value }) => Number(parseFloat(value).toFixed(4))) // 👈 Limpieza a 4 decimales
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
  @Transform(({ value }) =>
    value ? Number(parseFloat(value).toFixed(2)) : value,
  )
  costPrice?: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) =>
    value ? Number(parseFloat(value).toFixed(2)) : value,
  )
  salePrice?: number

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  sku?: string
}
