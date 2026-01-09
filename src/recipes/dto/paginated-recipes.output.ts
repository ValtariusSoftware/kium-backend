import { ObjectType, Field, Int } from '@nestjs/graphql'
import { Recipe } from '../entities/recipe.entity'

@ObjectType()
export class PaginatedRecipes {
  @Field(() => [Recipe])
  recipes: Recipe[]

  @Field(() => Int)
  total: number
}
