import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Recipe } from './entities/recipe.entity'
import { RecipeIngredient } from './entities/recipe-ingredient.entity'
import { RecipesService } from './recipes.service'
import { ItemsModule } from '../items/items.module' // Necesitamos el servicio de Items
import { RecipesResolver } from './recipes.resolver'

@Module({
  imports: [
    TypeOrmModule.forFeature([Recipe, RecipeIngredient]),
    forwardRef(() => ItemsModule),
  ],
  providers: [RecipesService, RecipesResolver],
  exports: [RecipesService],
})
export class RecipesModule {}
