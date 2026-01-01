import {
  Injectable,
  BadRequestException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Recipe } from './entities/recipe.entity'
import { CreateRecipeInput } from './dto/create-recipe.dto'
import { ItemsService } from '../items/items.service'
import { Item } from 'src/items/entities/item.entity'

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe)
    private recipesRepository: Repository<Recipe>,
    @Inject(forwardRef(() => ItemsService))
    private itemsService: ItemsService,
    private readonly dataSource: DataSource, // Inyectamos para asegurar la consistencia de los flags
  ) {}

  /**
   * Crea una nueva receta e infiere los roles de producción para los ítems involucrados.
   * También calcula el costo unitario del producto final basado en sus ingredientes.
   */
  async create(
    userId: string,
    createRecipeInput: CreateRecipeInput,
  ): Promise<Recipe> {
    const { finalProductId, ingredients, yieldQuantity } = createRecipeInput

    const finalProductItem = await this.itemsService.findOne(
      finalProductId,
      userId,
    )
    if (!finalProductItem) {
      throw new NotFoundException(
        `Item con ID ${finalProductId} no encontrado.`,
      )
    }

    const existingRecipe = await this.recipesRepository.findOne({
      where: { finalProductId },
    })
    if (existingRecipe) {
      throw new BadRequestException(
        `El producto ${finalProductItem.name} ya tiene una receta asociada.`,
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. Crear la Receta
      const newRecipe = queryRunner.manager.create(Recipe, {
        userId,
        finalProductId,
        yieldQuantity,
        ingredients: ingredients.map((ing) => ({
          ingredientItemId: ing.ingredientItemId,
          quantityRequired: ing.quantityRequired,
          unitOfMeasure: ing.unitOfMeasure,
        })),
      })

      const savedRecipe = await queryRunner.manager.save(newRecipe)

      // 2. 🧮 Calcular Costo Teórico Inicial
      let totalRecipeCost = 0
      for (const ing of ingredients) {
        const ingredientItem = await queryRunner.manager.findOne(Item, {
          where: { id: ing.ingredientItemId, userId },
        })

        if (!ingredientItem) {
          throw new NotFoundException(
            `Ingrediente con ID ${ing.ingredientItemId} no encontrado.`,
          )
        }

        totalRecipeCost +=
          (Number(ingredientItem.costPrice) || 0) * ing.quantityRequired
      }

      const calculatedUnitCost = totalRecipeCost / yieldQuantity

      // 3. 🚀 Sincronizar Ficha del Producto Final
      await queryRunner.manager.update(Item, finalProductId, {
        isProduced: true,
        isPurchasable: false, // 👈 CLAVE: Si tiene receta, ya no se compra (se produce)
        costPrice: calculatedUnitCost,
      })

      // 4. Marcar Insumos
      const ingredientIds = ingredients.map((ing) => ing.ingredientItemId)
      await queryRunner.manager.update(Item, ingredientIds, {
        isIngredient: true,
      })

      await queryRunner.commitTransaction()

      const result = await this.findOne(savedRecipe.id, userId)
      if (!result) throw new NotFoundException('Error al recuperar la receta.')
      return result
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }
  /**
   * Elimina una receta y actualiza los flags de los ítems involucrados.
   */
  async remove(recipeId: string, userId: string): Promise<boolean> {
    const recipe = await this.findOne(recipeId, userId)
    if (!recipe) {
      throw new NotFoundException('Receta no encontrada.')
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. Guardamos los IDs para procesarlos después de borrar la receta
      const finalProductId = recipe.finalProductId
      const ingredientIds = recipe.ingredients.map(
        (ing) => ing.ingredientItemId,
      )

      // 2. Borrar la receta (esto borra los RecipeIngredients por el cascade en la entidad)
      await queryRunner.manager.remove(recipe)

      // 3. Limpiar flag del Producto Final
      await queryRunner.manager.update(Item, finalProductId, {
        isProduced: false,
      })

      // 4. Limpiar flags de Ingredientes (solo si no se usan en OTRAS recetas)
      for (const ingredientId of ingredientIds) {
        const otherRecipeCount = await queryRunner.manager.count(
          'recipe_ingredients',
          {
            where: { ingredientItemId: ingredientId },
          },
        )

        if (otherRecipeCount === 0) {
          // Si ya nadie más usa este ítem como ingrediente, apagamos el flag
          await queryRunner.manager.update(Item, ingredientId, {
            isIngredient: false,
          })
        }
      }

      await queryRunner.commitTransaction()
      return true
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  // Método para obtener una receta por ID de Producto Final
  async findByFinalProductId(
    finalProductId: string,
    userId: string,
  ): Promise<Recipe | null> {
    const recipe = await this.recipesRepository.findOne({
      where: { finalProductId, userId },
      relations: ['ingredients', 'ingredients.ingredientItem'], // Cargar ingredientes y los detalles del ítem ingrediente
    })

    return recipe
  }

  /**
   * Obtiene una receta por su ID de Receta, asegurando que pertenezca al usuario,
   * y cargando sus ingredientes y el item final.
   */
  async findOne(recipeId: string, userId: string): Promise<Recipe | null> {
    const recipe = await this.recipesRepository.findOne({
      where: { id: recipeId, userId },
      relations: [
        'ingredients',
        'ingredients.ingredientItem', // <-- ¡CORREGIDO! Usar el nombre de la relación
        'finalProduct',
      ],
    })

    return recipe || null
  }
}
