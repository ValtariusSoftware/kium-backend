// sales/dto/create-sale.input.ts (Se mantiene igual)
import { InputType, Field, Float } from '@nestjs/graphql'
import { IsArray, IsUUID, IsNumber, Min, IsOptional } from 'class-validator'

@InputType()
export class SaleItemInput {
  @Field(() => String)
  @IsUUID()
  itemId: string

  @Field(() => Float)
  @IsNumber()
  @Min(0.01)
  quantity: number

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  priceOverride?: number // Para permitir vender a un precio distinto al de lista
}

@InputType()
export class CreateSaleInput {
  @Field(() => [SaleItemInput])
  @IsArray()
  items: SaleItemInput[]
}
