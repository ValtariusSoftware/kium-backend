import { Resolver, Mutation, Args, Query } from '@nestjs/graphql'
import { RecipesService } from './recipes.service'
import { Recipe } from './entities/recipe.entity'
import { CreateRecipeInput } from './dto/create-recipe.dto'
import { UseGuards } from '@nestjs/common'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { User } from '../users/entities/user.entity'
import { ID } from '@nestjs/graphql'
import { UpdateRecipeInput } from './dto/update-recipe.dto'
import { PaginatedRecipes } from './dto/paginated-recipes.output'
import { PaginationInput } from 'src/common/dto/pagination.input'

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

  @Mutation(() => Recipe, {
    description: 'Actualiza una receta existente y recalcula costos.',
  })
  async updateRecipe(
    @Args('updateRecipeInput') updateRecipeInput: UpdateRecipeInput,
    @CurrentUser() user: User,
  ): Promise<Recipe> {
    return this.recipesService.update(user.id, updateRecipeInput)
  }

  @Mutation(() => Boolean, {
    description:
      'Elimina una receta y actualiza los roles (isProduced/isIngredient) de los ítems.',
  })
  async removeRecipe(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<boolean> {
    return this.recipesService.remove(id, user.id)
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

  @Query(() => PaginatedRecipes, {
    name: 'myRecipes',
    description: 'Obtiene todas las recetas del usuario de forma paginada.',
  })
  async findAll(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedRecipes> {
    const p = pagination || new PaginationInput()
    return this.recipesService.findAll(user.id, p)
  }
}
