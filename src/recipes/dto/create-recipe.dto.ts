import { InputType, Field, Float, ID } from '@nestjs/graphql'
import {
  IsUUID,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
  IsEnum,
  IsString,
  IsOptional,
} from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { BaseUnit } from '../../items/entities/item.entity'

// 1. DTO para las líneas de Ingredientes
@InputType()
export class CreateRecipeIngredientInput {
  @Field(() => ID)
  @IsUUID()
  ingredientItemId: string

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001)
  @Transform(({ value }) => Number(parseFloat(value).toFixed(4))) // 👈 4 decimales para insumos
  quantityRequired: number

  @Field(() => BaseUnit)
  @IsEnum(BaseUnit)
  unitOfMeasure: BaseUnit

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  notes?: string
}

@InputType()
export class CreateRecipeInput {
  @Field(() => ID)
  @IsUUID()
  finalProductId: string

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001)
  @Transform(({ value }) => Number(parseFloat(value).toFixed(4)))
  yieldQuantity: number

  @Field(() => [CreateRecipeIngredientInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeIngredientInput)
  ingredients: CreateRecipeIngredientInput[]
}
