// sales/dto/create-sale.input.ts (Se mantiene igual)
import { InputType, Field, Float } from '@nestjs/graphql'
import { IsArray, IsUUID, IsNumber, Min } from 'class-validator'

@InputType()
export class SaleItemInput {
  @Field(() => String)
  @IsUUID()
  itemId: string

  @Field(() => Float)
  @IsNumber()
  @Min(0.01)
  quantity: number
}

@InputType()
export class CreateSaleInput {
  @Field(() => [SaleItemInput])
  @IsArray()
  items: SaleItemInput[]
}
