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
import { UpdateRecipeInput } from './dto/update-recipe.dto'
import { RecipeIngredient } from './entities/recipe-ingredient.entity'

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
   * Verifica recursivamente si un ítem ya es parte de una cadena de recetas
   * para evitar bucles infinitos.
   */
  private async checkForCircularDependency(
    targetId: string,
    currentIngredients: string[],
    userId: string,
  ): Promise<void> {
    for (const ingredientId of currentIngredients) {
      // Si el ingrediente es el mismo producto que estamos creando -> CIRCULAR
      if (ingredientId === targetId) {
        throw new BadRequestException(
          'Dependencia circular detectada: un ingrediente no puede depender del producto final en ningún nivel.',
        )
      }

      // Buscamos si este ingrediente tiene su propia receta
      const recipe = await this.recipesRepository.findOne({
        where: { finalProductId: ingredientId, userId },
        relations: ['ingredients'],
      })

      // Si tiene receta, revisamos sus ingredientes (recursión)
      if (recipe && recipe.ingredients.length > 0) {
        const nextLevelIds = recipe.ingredients.map((i) => i.ingredientItemId)
        await this.checkForCircularDependency(targetId, nextLevelIds, userId)
      }
    }
  }

  /**
   * Crea una nueva receta e infiere los roles de producción para los ítems involucrados.
   * También calcula el costo unitario del producto final basado en sus ingredientes.
   */
  async create(
    userId: string,
    createRecipeInput: CreateRecipeInput,
  ): Promise<Recipe> {
    const { finalProductId, ingredients, yieldQuantity } = createRecipeInput

    // 1. Obtener IDs de ingredientes para las validaciones
    const ingredientIds = ingredients.map((ing) => ing.ingredientItemId)

    // 2. VALIDACIÓN DE CIRCULARIDAD PROFUNDA
    // Esta función rastrea recursivamente que ningún ingrediente dependa,
    // en ningún nivel de su propia receta, del producto que estamos intentando crear.
    await this.checkForCircularDependency(finalProductId, ingredientIds, userId)

    // 3. Verificar existencia y pertenencia del producto final
    const finalProductItem = await this.itemsService.findOne(
      finalProductId,
      userId,
    )
    if (!finalProductItem) {
      throw new NotFoundException(
        `Item con ID ${finalProductId} no encontrado.`,
      )
    }

    // 4. Validar que no exista ya una receta para este producto (Punto 10)
    const existingRecipe = await this.recipesRepository.findOne({
      where: { finalProductId, userId },
    })
    if (existingRecipe) {
      throw new BadRequestException(
        `El producto "${finalProductItem.name}" ya tiene una receta asociada.`,
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 5. Crear la instancia de la Receta e Ingredientes
      const newRecipe = queryRunner.manager.create(Recipe, {
        userId,
        finalProductId,
        yieldQuantity,
        ingredients: ingredients.map((ing) => ({
          ingredientItemId: ing.ingredientItemId,
          quantityRequired: ing.quantityRequired,
          unitOfMeasure: ing.unitOfMeasure,
          notes: ing.notes,
        })),
      })

      const savedRecipe = await queryRunner.manager.save(newRecipe)

      // 6. 🧮 Calcular Costo Teórico Inicial (Punto 4: Precisión Decimal)
      let totalRecipeCost = 0
      for (const ing of ingredients) {
        const ingredientItem = await queryRunner.manager.findOne(Item, {
          where: { id: ing.ingredientItemId, userId },
        })

        if (!ingredientItem)
          throw new NotFoundException(
            `Ingrediente ${ing.ingredientItemId} no encontrado.`,
          )

        // Los valores ya vienen como números gracias al ColumnNumericTransformer
        totalRecipeCost +=
          (ingredientItem.costPrice || 0) * ing.quantityRequired
      }

      // Redondeamos el costo unitario a 2 decimales (Dinero)
      const calculatedUnitCost = Number(
        (totalRecipeCost / yieldQuantity).toFixed(2),
      )

      // 7. 🚀 Sincronizar Ficha del Producto Final
      await queryRunner.manager.update(Item, finalProductId, {
        isProduced: true,
        // No forzamos isPurchasable: false por si es un producto intermedio que también se compra
        costPrice: calculatedUnitCost,
      })

      // 8. Marcar Insumos como ingredientes
      await queryRunner.manager.update(Item, ingredientIds, {
        isIngredient: true,
      })

      await queryRunner.commitTransaction()

      // 9. Devolver la receta completa con sus relaciones
      const result = await this.findOne(savedRecipe.id, userId)
      if (!result)
        throw new Error('Error crítico: No se pudo recuperar la receta creada.')

      return result
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Actualiza una receta existente, reemplaza sus ingredientes y recalcula
   * el costo unitario del producto final.
   * Valida que los nuevos cambios no generen dependencias circulares.
   */
  async update(
    userId: string,
    updateRecipeInput: UpdateRecipeInput,
  ): Promise<Recipe> {
    const { id, ingredients, yieldQuantity } = updateRecipeInput

    // 1. Verificar que la receta existe
    const recipe = await this.findOne(id, userId)
    if (!recipe) throw new NotFoundException('Receta no encontrada.')

    const finalProductId = recipe.finalProductId

    // 2. Si vienen ingredientes nuevos, validar circularidad profunda
    if (ingredients) {
      const ingredientIds = ingredients.map((ing) => ing.ingredientItemId)
      await this.checkForCircularDependency(
        finalProductId,
        ingredientIds,
        userId,
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 3. Actualizar datos básicos de la receta
      if (yieldQuantity) {
        recipe.yieldQuantity = yieldQuantity
      }

      // 4. Si hay nuevos ingredientes, reemplazamos los anteriores
      if (ingredients) {
        // Borramos los RecipeIngredients actuales (la relación es cascade: true normalmente,
        // pero aquí los reemplazamos manualmente para asegurar consistencia)
        await queryRunner.manager.delete('recipe_ingredients', { recipeId: id })

        recipe.ingredients = ingredients.map((ing) => ({
          ingredientItemId: ing.ingredientItemId,
          quantityRequired: ing.quantityRequired,
          unitOfMeasure: ing.unitOfMeasure,
          notes: ing.notes,
        })) as RecipeIngredient[]
      }

      // 5. Recalcular Costo (usamos la misma lógica del create)
      let totalRecipeCost = 0
      const currentIngredients = ingredients || recipe.ingredients

      for (const ing of currentIngredients) {
        const ingredientItem = await queryRunner.manager.findOne(Item, {
          where: { id: ing.ingredientItemId, userId },
        })
        if (ingredientItem) {
          totalRecipeCost +=
            (ingredientItem.costPrice || 0) * ing.quantityRequired
        }
      }

      const newUnitCost = Number(
        (totalRecipeCost / (yieldQuantity || recipe.yieldQuantity)).toFixed(2),
      )

      // 6. Actualizar el costo en la ficha del Item
      await queryRunner.manager.update(Item, finalProductId, {
        costPrice: newUnitCost,
      })

      await queryRunner.commitTransaction()

      const result = await this.findOne(id, userId)
      if (!result) throw new Error('Error al recuperar la receta actualizada.')
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

  /**
   * Verifica si un ítem está siendo usado como ingrediente en alguna receta.
   */
  async isItemInAnyRecipe(itemId: string, userId: string): Promise<boolean> {
    const count = await this.dataSource
      .getRepository(RecipeIngredient)
      .createQueryBuilder('ri')
      .innerJoin('ri.recipe', 'recipe') // Usamos el nombre de la relación en la entidad
      .where('ri.ingredientItemId = :itemId', { itemId })
      .andWhere('recipe.userId = :userId', { userId })
      .getCount()

    return count > 0
  }
}
