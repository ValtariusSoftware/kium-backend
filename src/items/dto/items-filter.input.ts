import { Field, InputType, registerEnumType } from '@nestjs/graphql'
import { ItemType } from '../entities/item.entity'
// 1. Importa los validadores
import { IsOptional, IsArray, IsEnum } from 'class-validator'

export enum StockStatusFilter {
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  AVAILABLE = 'AVAILABLE',
}

registerEnumType(StockStatusFilter, { name: 'StockStatusFilter' })

@InputType()
export class ItemsFilterInput {
  @Field(() => [ItemType], { nullable: true })
  @IsOptional() // Permite que no venga el campo
  @IsArray() // Valida que sea un array
  @IsEnum(ItemType, { each: true }) // Valida que cada elemento sea un tipo de ítem válido
  types?: ItemType[]

  @Field(() => StockStatusFilter, { nullable: true })
  @IsOptional()
  @IsEnum(StockStatusFilter) // Valida que sea un valor del enum de stock
  stockStatus?: StockStatusFilter
}
