import * as DataLoader from 'dataloader'
import { Recipe } from './entities/recipe.entity'
import { RecipesService } from './recipes.service'

// Definimos el tipo del loader para que acepte que una receta puede no existir (null)
export type RecipesLoader = DataLoader<string, Recipe | null>

export const createRecipesLoader = (
  recipesService: RecipesService,
  userId: string,
): RecipesLoader => {
  return new DataLoader<string, Recipe | null>(async (ids: string[]) => {
    const recipes = await recipesService.findBatchByFinalProductIds(ids, userId)

    // Creamos el mapa
    const recipesMap = new Map(recipes.map((r) => [r.finalProductId, r]))

    // Si no encuentra la receta, devolvemos null explícitamente en lugar de undefined
    return ids.map((id) => recipesMap.get(id) || null)
  })
}
