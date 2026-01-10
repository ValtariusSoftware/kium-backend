// items/dto/produce-item.dto.ts

import { InputType, Field, ID, Float } from '@nestjs/graphql'
import { IsUUID, IsNumber, Min } from 'class-validator'

@InputType()
export class ProduceItemInput {
  @Field(() => ID)
  @IsUUID()
  recipeId: string

  @Field(() => Float)
  @IsNumber()
  @Min(0.0001) // No se puede producir una cantidad de 0
  quantityToProduce: number
}
