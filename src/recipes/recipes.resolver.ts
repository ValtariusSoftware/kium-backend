import { Resolver, Mutation, Args, Query } from '@nestjs/graphql'
import { RecipesService } from './recipes.service'
import { Recipe } from './entities/recipe.entity'
import { CreateRecipeInput } from './dto/create-recipe.dto'
import { UseGuards } from '@nestjs/common'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { User } from '../users/entities/user.entity'
import { ID } from '@nestjs/graphql'

@Resolver(() => Recipe)
@UseGuards(JwtGuard)
export class RecipesResolver {
  constructor(private readonly recipesService: RecipesService) {}

  @Mutation(() => Recipe, {
    description: 'Crea una nueva receta para un FINAL_PRODUCT.',
  })
  async createRecipe(
    @Args('createRecipeInput') createRecipeInput: CreateRecipeInput,
    @CurrentUser() user: User,
  ): Promise<Recipe> {
    return this.recipesService.create(user.id, createRecipeInput)
  }

  @Query(() => Recipe, {
    name: 'recipeByProduct',
    description: 'Obtiene la receta por el ID del producto final.',
  })
  async getRecipeByProductId(
    @Args('finalProductId', { type: () => ID }) finalProductId: string,
    @CurrentUser() user: User,
  ): Promise<Recipe | null> {
    return this.recipesService.findByFinalProductId(finalProductId, user.id)
  }
}
