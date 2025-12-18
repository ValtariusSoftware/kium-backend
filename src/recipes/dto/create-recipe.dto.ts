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
import { Type } from 'class-transformer'
import { BaseUnit } from '../../items/entities/item.entity'

// 1. DTO para las líneas de Ingredientes
@InputType()
export class CreateRecipeIngredientInput {
  @Field(() => ID)
  @IsUUID()
  ingredientItemId: string // ID del Ítem que es el ingrediente

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001)
  quantityRequired: number

  @Field(() => BaseUnit)
  @IsEnum(BaseUnit)
  unitOfMeasure: BaseUnit // La unidad base (ej. LITER, KILOGRAM)

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  notes?: string
}

// 2. DTO principal para la Receta
@InputType()
export class CreateRecipeInput {
  @Field(() => ID)
  @IsUUID()
  finalProductId: string // ID del Ítem de tipo FINAL_PRODUCT

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001)
  yieldQuantity: number // Cantidad producida (ej. 1, si es 1 unidad de helado)

  @Field(() => [CreateRecipeIngredientInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeIngredientInput) // Necesario para que class-transformer funcione
  ingredients: CreateRecipeIngredientInput[]
}
