import { ObjectType, Field, Float } from '@nestjs/graphql'

@ObjectType()
export class IngredientConsumption {
  @Field()
  name: string

  @Field(() => Float)
  totalUsedForThisItem: number

  @Field()
  unit: string
}

@ObjectType()
export class SimulatedItem {
  @Field()
  itemId: string

  @Field(() => String, { nullable: true })
  itemName: string | null

  @Field(() => Float)
  requestedQuantity: number

  @Field(() => [IngredientConsumption])
  ingredientsUsage: IngredientConsumption[]

  @Field(() => Boolean)
  hasInsufficientStock: boolean // Para que el front ponga la ❌
}

@ObjectType()
export class StockAlert {
  @Field()
  ingredientName: string

  @Field(() => Float)
  missingQuantity: number

  @Field()
  unit: string
}

@ObjectType()
export class BatchSimulationResponse {
  @Field(() => Boolean)
  isViable: boolean

  @Field(() => [SimulatedItem])
  items: SimulatedItem[]

  @Field(() => [StockAlert])
  alerts: StockAlert[]
}
