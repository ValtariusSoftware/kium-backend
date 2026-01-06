import { Field, InputType, registerEnumType } from '@nestjs/graphql'
// 1. Importa los validadores
import { IsOptional, IsEnum } from 'class-validator'

export enum StockStatusFilter {
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  AVAILABLE = 'AVAILABLE',
}

registerEnumType(StockStatusFilter, { name: 'StockStatusFilter' })

@InputType()
export class ItemsFilterInput {
  // Ahora filtramos por los nuevos flags
  @Field({ nullable: true })
  @IsOptional()
  isSaleable?: boolean

  @Field({ nullable: true })
  @IsOptional()
  isProduced?: boolean

  @Field({ nullable: true })
  @IsOptional()
  isIngredient?: boolean

  @Field(() => StockStatusFilter, { nullable: true })
  @IsOptional()
  @IsEnum(StockStatusFilter) // Valida que sea un valor del enum de stock
  stockStatus?: StockStatusFilter

  @Field({ nullable: true })
  @IsOptional()
  search?: string
}
