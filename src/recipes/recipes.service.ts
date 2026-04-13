import {
  Injectable,
  BadRequestException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, QueryRunner, Repository } from 'typeorm'
import { Recipe } from './entities/recipe.entity'
import { CreateRecipeInput } from './dto/create-recipe.dto'
import { ItemsService } from '../items/items.service'
import { Item } from 'src/items/entities/item.entity'
import { UpdateRecipeInput } from './dto/update-recipe.dto'
import { RecipeIngredient } from './entities/recipe-ingredient.entity'
import { PaginationInput } from 'src/common/dto/pagination.input'

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
    depth = 0, // Añadimos profundidad
  ): Promise<void> {
    if (depth > 15) {
      // Seguridad contra recursión infinita
      throw new BadRequestException(
        'Se ha excedido el límite de profundidad en la receta.',
      )
    }

    for (const ingredientId of currentIngredients) {
      if (ingredientId === targetId) {
        throw new BadRequestException('Dependencia circular detectada.')
      }

      const recipe = await this.recipesRepository.findOne({
        where: { finalProductId: ingredientId, userId },
        relations: ['ingredients'],
      })

      if (recipe && recipe?.ingredients?.length > 0) {
        const nextLevelIds = recipe.ingredients.map((i) => i.ingredientItemId)
        // Pasamos la profundidad + 1
        await this.checkForCircularDependency(
          targetId,
          nextLevelIds,
          userId,
          depth + 1,
        )
      }
    }
  }
  // private async checkForCircularDependency(
  //   targetId: string,
  //   currentIngredients: string[],
  //   userId: string,
  // ): Promise<void> {
  //   for (const ingredientId of currentIngredients) {
  //     // Si el ingrediente es el mismo producto que estamos creando -> CIRCULAR
  //     if (ingredientId === targetId) {
  //       throw new BadRequestException(
  //         'Dependencia circular detectada: un ingrediente no puede depender del producto final en ningún nivel.',
  //       )
  //     }

  //     // Buscamos si este ingrediente tiene su propia receta
  //     const recipe = await this.recipesRepository.findOne({
  //       where: { finalProductId: ingredientId, userId },
  //       relations: ['ingredients'],
  //     })

  //     // Si tiene receta, revisamos sus ingredientes (recursión)
  //     if (recipe && recipe.ingredients.length > 0) {
  //       const nextLevelIds = recipe.ingredients.map((i) => i.ingredientItemId)
  //       await this.checkForCircularDependency(targetId, nextLevelIds, userId)
  //     }
  //   }
  // }

  /**
   * Crea una nueva receta e infiere los roles de producción para los ítems involucrados.
   * También calcula el costo unitario del producto final basado en sus ingredientes.
   */
  /**
   * Crea una nueva receta e infiere los roles de producción para los ítems involucrados.
   * Aplica normalización de unidades para el cálculo de costos y validación circular.
   */
  async create(
    userId: string,
    createRecipeInput: CreateRecipeInput,
  ): Promise<Recipe> {
    const { finalProductId, ingredients, yieldQuantity } = createRecipeInput

    // 1. Obtener IDs de ingredientes para validaciones masivas
    const ingredientIds = ingredients.map((ing) => ing.ingredientItemId)

    // 2. VALIDACIÓN DE CIRCULARIDAD PROFUNDA
    // Evita que el producto A dependa de B, y B de A (bucle infinito).
    await this.checkForCircularDependency(finalProductId, ingredientIds, userId)

    // 3. Verificar existencia del producto final
    const finalProductItem = await this.itemsService.findOne(
      finalProductId,
      userId,
    )
    if (!finalProductItem) {
      throw new NotFoundException(
        `Item final con ID ${finalProductId} no encontrado.`,
      )
    }

    // 4. Validar unicidad: Un producto solo puede tener una receta activa
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

      // 6. 🧮 CÁLCULO DE COSTO NORMALIZADO
      let totalRecipeCost = 0

      for (const ing of ingredients) {
        const ingredientItem = await queryRunner.manager.findOne(Item, {
          where: { id: ing.ingredientItemId, userId },
        })

        if (!ingredientItem) {
          throw new NotFoundException(
            `Ingrediente ${ing.ingredientItemId} no encontrado.`,
          )
        }

        /**
         * REFACTORIZACIÓN SENIOR: Normalización de cantidad.
         * Si el costo (costPrice) está expresado en la unidad base (ej: 1kg),
         * y la receta pide 500g, debemos dividir por el factor de conversión
         * para obtener la proporción real del costo.
         */
        const factor = ingredientItem.conversionToBaseQty || 1
        const quantityInBaseUnit = ing.quantityRequired / factor

        totalRecipeCost += (ingredientItem.costPrice || 0) * quantityInBaseUnit
      }

      // Redondeamos el costo unitario final (en centavos enteros)
      const calculatedUnitCost = Math.round(totalRecipeCost / yieldQuantity)

      // 7. 🚀 ACTUALIZACIÓN MASIVA DE ÍTEMS
      // Sincronizar Ficha del Producto Final
      await queryRunner.manager.update(Item, finalProductId, {
        isProduced: true,
        costPrice: calculatedUnitCost,
      })

      // Marcar todos los insumos como ingredientes de una sola vez
      await queryRunner.manager.update(Item, ingredientIds, {
        isIngredient: true,
      })

      await queryRunner.commitTransaction()

      // 8. Devolver la receta completa con sus relaciones
      const result = await this.findOne(savedRecipe.id, userId)
      if (!result) {
        throw new Error('Error crítico: No se pudo recuperar la receta creada.')
      }

      return result
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }
  // async create(
  //   userId: string,
  //   createRecipeInput: CreateRecipeInput,
  // ): Promise<Recipe> {
  //   const { finalProductId, ingredients, yieldQuantity } = createRecipeInput

  //   // 1. Obtener IDs de ingredientes para las validaciones
  //   const ingredientIds = ingredients.map((ing) => ing.ingredientItemId)

  //   // 2. VALIDACIÓN DE CIRCULARIDAD PROFUNDA
  //   // Esta función rastrea recursivamente que ningún ingrediente dependa,
  //   // en ningún nivel de su propia receta, del producto que estamos intentando crear.
  //   await this.checkForCircularDependency(finalProductId, ingredientIds, userId)

  //   // 3. Verificar existencia y pertenencia del producto final
  //   const finalProductItem = await this.itemsService.findOne(
  //     finalProductId,
  //     userId,
  //   )
  //   if (!finalProductItem) {
  //     throw new NotFoundException(
  //       `Item con ID ${finalProductId} no encontrado.`,
  //     )
  //   }

  //   // 4. Validar que no exista ya una receta para este producto (Punto 10)
  //   const existingRecipe = await this.recipesRepository.findOne({
  //     where: { finalProductId, userId },
  //   })
  //   if (existingRecipe) {
  //     throw new BadRequestException(
  //       `El producto "${finalProductItem.name}" ya tiene una receta asociada.`,
  //     )
  //   }

  //   const queryRunner = this.dataSource.createQueryRunner()
  //   await queryRunner.connect()
  //   await queryRunner.startTransaction()

  //   try {
  //     // 5. Crear la instancia de la Receta e Ingredientes
  //     const newRecipe = queryRunner.manager.create(Recipe, {
  //       userId,
  //       finalProductId,
  //       yieldQuantity,
  //       ingredients: ingredients.map((ing) => ({
  //         ingredientItemId: ing.ingredientItemId,
  //         quantityRequired: ing.quantityRequired,
  //         unitOfMeasure: ing.unitOfMeasure,
  //         notes: ing.notes,
  //       })),
  //     })

  //     const savedRecipe = await queryRunner.manager.save(newRecipe)

  //     // 6. 🧮 Calcular Costo Teórico Inicial (Punto 4: Precisión Decimal)
  //     let totalRecipeCost = 0
  //     for (const ing of ingredients) {
  //       const ingredientItem = await queryRunner.manager.findOne(Item, {
  //         where: { id: ing.ingredientItemId, userId },
  //       })

  //       if (!ingredientItem)
  //         throw new NotFoundException(
  //           `Ingrediente ${ing.ingredientItemId} no encontrado.`,
  //         )

  //       // Los valores ya vienen como números gracias al ColumnNumericTransformer
  //       totalRecipeCost +=
  //         (ingredientItem.costPrice || 0) * ing.quantityRequired
  //     }

  //     // Redondeamos el costo unitario a 2 decimales (Dinero)
  //     const calculatedUnitCost = Number(
  //       (totalRecipeCost / yieldQuantity).toFixed(2),
  //     )

  //     // 7. 🚀 Sincronizar Ficha del Producto Final
  //     await queryRunner.manager.update(Item, finalProductId, {
  //       isProduced: true,
  //       // No forzamos isPurchasable: false por si es un producto intermedio que también se compra
  //       costPrice: calculatedUnitCost,
  //     })

  //     // 8. Marcar Insumos como ingredientes
  //     await queryRunner.manager.update(Item, ingredientIds, {
  //       isIngredient: true,
  //     })

  //     await queryRunner.commitTransaction()

  //     // 9. Devolver la receta completa con sus relaciones
  //     const result = await this.findOne(savedRecipe.id, userId)
  //     if (!result)
  //       throw new Error('Error crítico: No se pudo recuperar la receta creada.')

  //     return result
  //   } catch (err) {
  //     await queryRunner.rollbackTransaction()
  //     throw err
  //   } finally {
  //     await queryRunner.release()
  //   }
  // }

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

    // 1. Verificar existencia
    const recipe = await this.findOne(id, userId)
    if (!recipe) throw new NotFoundException('Receta no encontrada.')

    const finalProductId = recipe.finalProductId

    // 2. Validar Circularidad
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
      // 3. Actualizar rinde de la receta
      if (yieldQuantity) recipe.yieldQuantity = yieldQuantity

      // 4. Reemplazo de ingredientes (Uso explícito del manager para el insert)
      if (ingredients) {
        // 1. Borrar usando la Entidad (TypeORM mapea recipeId -> recipe_id solo)
        // Usamos el objeto de condición basado en la entidad
        await queryRunner.manager.delete(RecipeIngredient, {
          recipeId: id, // 🟢 Usá el nombre de la propiedad de la clase
        })

        // 2. Mapear a objetos de la Entidad
        const newIngredients = ingredients.map((ing) => {
          const ingredient = new RecipeIngredient()
          ingredient.recipeId = id
          ingredient.ingredientItemId = ing.ingredientItemId
          ingredient.quantityRequired = ing.quantityRequired
          ingredient.unitOfMeasure = ing.unitOfMeasure
          ingredient.notes = ing.notes
          return ingredient
        })

        // 3. Insertar usando la Entidad
        await queryRunner.manager.insert(RecipeIngredient, newIngredients)
      }

      // 5. Recalcular Costo Teórico
      let totalRecipeCost = 0
      const currentIngredients = ingredients || recipe.ingredients

      for (const ing of currentIngredients) {
        const item = await queryRunner.manager.findOne(Item, {
          where: { id: ing.ingredientItemId, userId },
        })

        if (item) {
          // Normalización exacta con decimales en memoria
          const factor = Number(item.conversionToBaseQty) || 1
          const qtyInBaseUnit = Number(ing.quantityRequired) / factor
          totalRecipeCost += (Number(item.costPrice) || 0) * qtyInBaseUnit
        }
      }

      // 6. Redondeo final para el campo int8
      // Calculamos el costo por unidad. Si totalRecipeCost es decimal,
      // el Math.round es necesario para que Postgres acepte el int8.
      const newUnitCost = Math.round(
        totalRecipeCost / (yieldQuantity || recipe.yieldQuantity),
      )

      // 7. Sincronizar Ficha del Item e invocar efecto dominó
      await queryRunner.manager.update(Item, finalProductId, {
        costPrice: newUnitCost, // Usamos el nombre de columna del DDL
        updatedAt: new Date(),
      })

      await this.syncRecipeCostsByIngredient(
        userId,
        finalProductId,
        queryRunner,
      )

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
  // async update(
  //   userId: string,
  //   updateRecipeInput: UpdateRecipeInput,
  // ): Promise<Recipe> {
  //   const { id, ingredients, yieldQuantity } = updateRecipeInput

  //   // 1. Verificar existencia
  //   const recipe = await this.findOne(id, userId)
  //   if (!recipe) throw new NotFoundException('Receta no encontrada.')

  //   const finalProductId = recipe.finalProductId

  //   // 2. Validar Circularidad si se cambian ingredientes
  //   if (ingredients) {
  //     const ingredientIds = ingredients.map((ing) => ing.ingredientItemId)
  //     await this.checkForCircularDependency(
  //       finalProductId,
  //       ingredientIds,
  //       userId,
  //     )
  //   }

  //   const queryRunner = this.dataSource.createQueryRunner()
  //   await queryRunner.connect()
  //   await queryRunner.startTransaction()

  //   try {
  //     // 3. Actualizar datos de la receta
  //     if (yieldQuantity) recipe.yieldQuantity = yieldQuantity

  //     // 4. Reemplazo de ingredientes (Lógica manual para asegurar integridad)
  //     if (ingredients) {
  //       await queryRunner.manager.delete('recipe_ingredients', { recipeId: id })
  //       recipe.ingredients = ingredients.map((ing) => ({
  //         ingredientItemId: ing.ingredientItemId,
  //         quantityRequired: ing.quantityRequired,
  //         unitOfMeasure: ing.unitOfMeasure,
  //         notes: ing.notes,
  //       })) as RecipeIngredient[]
  //     }

  //     // 5. Recalcular Costo Teórico con Normalización
  //     let totalRecipeCost = 0
  //     const currentIngredients = ingredients || recipe.ingredients

  //     for (const ing of currentIngredients) {
  //       const item = await queryRunner.manager.findOne(Item, {
  //         where: { id: ing.ingredientItemId, userId },
  //       })

  //       if (item) {
  //         // Normalización: (Cantidad Requerida / Factor de Conversión) * Precio Unitario
  //         const factor = item.conversionToBaseQty || 1
  //         const qtyInBaseUnit = ing.quantityRequired / factor
  //         totalRecipeCost += (item.costPrice || 0) * qtyInBaseUnit
  //       }
  //     }

  //     const newUnitCost = Math.round(
  //       totalRecipeCost / (yieldQuantity || recipe.yieldQuantity),
  //     )

  //     // 6. Sincronizar Ficha del Item
  //     await queryRunner.manager.update(Item, finalProductId, {
  //       costPrice: newUnitCost,
  //     })

  //     // 7. Efecto Dominó: Actualizar costos de productos que usan este item como ingrediente
  //     await this.syncRecipeCostsByIngredient(
  //       userId,
  //       finalProductId,
  //       queryRunner,
  //     )

  //     await queryRunner.commitTransaction()

  //     const result = await this.findOne(id, userId)
  //     if (!result) throw new Error('Error al recuperar la receta actualizada.')
  //     return result
  //   } catch (err) {
  //     await queryRunner.rollbackTransaction()
  //     throw err
  //   } finally {
  //     await queryRunner.release()
  //   }
  // }

  /**
   * Elimina una receta y actualiza los flags de los ítems involucrados.
   */
  async remove(recipeId: string, userId: string): Promise<boolean> {
    const recipe = await this.findOne(recipeId, userId)
    if (!recipe) throw new NotFoundException('Receta no encontrada.')

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const finalProductId = recipe.finalProductId
      const ingredientIds = recipe.ingredients.map(
        (ing) => ing.ingredientItemId,
      )

      // 1. Borrar receta
      await queryRunner.manager.remove(recipe)

      // 2. El producto ya no se produce
      await queryRunner.manager.update(Item, finalProductId, {
        isProduced: false,
      })

      // 3. Optimización: Buscar qué ingredientes quedaron "huérfanos" (ya no se usan en ninguna otra receta)
      if (ingredientIds.length > 0) {
        const stillUsed = await queryRunner.manager
          .createQueryBuilder(RecipeIngredient, 'ri')
          .select('ri.ingredientItemId')
          .where('ri.ingredientItemId IN (:...ids)', { ids: ingredientIds })
          .getRawMany()

        const stillUsedIds = stillUsed.map((r) => r.ingredientItemId)
        const redundantIds = ingredientIds.filter(
          (id) => !stillUsedIds.includes(id),
        )

        if (redundantIds.length > 0) {
          await queryRunner.manager.update(Item, redundantIds, {
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
  // async remove(recipeId: string, userId: string): Promise<boolean> {
  //   const recipe = await this.findOne(recipeId, userId)
  //   if (!recipe) {
  //     throw new NotFoundException('Receta no encontrada.')
  //   }

  //   const queryRunner = this.dataSource.createQueryRunner()
  //   await queryRunner.connect()
  //   await queryRunner.startTransaction()

  //   try {
  //     // 1. Guardamos los IDs para procesarlos después de borrar la receta
  //     const finalProductId = recipe.finalProductId
  //     const ingredientIds = recipe.ingredients.map(
  //       (ing) => ing.ingredientItemId,
  //     )

  //     // 2. Borrar la receta (esto borra los RecipeIngredients por el cascade en la entidad)
  //     await queryRunner.manager.remove(recipe)

  //     // 3. Limpiar flag del Producto Final
  //     await queryRunner.manager.update(Item, finalProductId, {
  //       isProduced: false,
  //     })

  //     // 4. Limpiar flags de Ingredientes (solo si no se usan en OTRAS recetas)
  //     for (const ingredientId of ingredientIds) {
  //       const otherRecipeCount = await queryRunner.manager.count(
  //         'recipe_ingredients',
  //         {
  //           where: { ingredientItemId: ingredientId },
  //         },
  //       )

  //       if (otherRecipeCount === 0) {
  //         // Si ya nadie más usa este ítem como ingrediente, apagamos el flag
  //         await queryRunner.manager.update(Item, ingredientId, {
  //           isIngredient: false,
  //         })
  //       }
  //     }

  //     await queryRunner.commitTransaction()
  //     return true
  //   } catch (err) {
  //     await queryRunner.rollbackTransaction()
  //     throw err
  //   } finally {
  //     await queryRunner.release()
  //   }
  // }

  // Método para obtener una receta por ID de Producto Final
  async findByFinalProductId(
    finalProductId: string,
    userId: string,
  ): Promise<Recipe | null> {
    const recipe = await this.recipesRepository.findOne({
      where: { finalProductId, userId },
      relations: ['ingredients', 'ingredients.ingredientItem', 'finalProduct'], // Cargar ingredientes y los detalles del ítem ingrediente
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

  // En RecipesService
  async findBatchByFinalProductIds(
    ids: string[],
    userId: string,
  ): Promise<Recipe[]> {
    return this.recipesRepository.find({
      where: {
        finalProductId: In(ids),
        userId: userId, // <--- SEGURIDAD: Solo traer recetas del usuario actual
      },
      relations: ['ingredients', 'ingredients.ingredientItem'],
    })
  }

  /**
   * Obtiene todas las recetas del usuario con paginación.
   * Útil para el catálogo de recetas en la App.
   */
  async findAll(
    userId: string,
    pagination: PaginationInput,
  ): Promise<{ recipes: Recipe[]; total: number }> {
    const [recipes, total] = await this.recipesRepository.findAndCount({
      where: { userId },
      relations: ['finalProduct', 'ingredients', 'ingredients.ingredientItem'],
      order: { createdAt: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    })

    return { recipes, total }
  }

  /*Este método solo hace la cuenta, NO va a la base de datos.
  Es súper rápido porque recibe la receta con todo cargado.*/
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runVirtualStockMath(recipe: any): number {
    if (!recipe || !recipe.ingredients?.length) return 0

    let minPossible = Infinity
    const recipeYield = Number(recipe.yieldQuantity) || 1

    for (const ingredient of recipe.ingredients) {
      if (!ingredient.ingredientItem) continue

      const stockAvailable = Number(ingredient.ingredientItem.stock) || 0
      // Senior tip: Usar Math.max(1, ...) para evitar división por cero
      const conversion = Math.max(
        1,
        Number(ingredient.ingredientItem.conversionToBaseQty) || 1,
      )

      // Cantidad necesaria de "Stock" para hacer 1 unidad final
      const qtyNeededPerUnit =
        ingredient.quantityRequired / conversion / recipeYield

      if (qtyNeededPerUnit > 0) {
        const possible = Math.floor(stockAvailable / qtyNeededPerUnit)
        if (possible < minPossible) minPossible = possible
      }
    }

    return minPossible === Infinity ? 0 : minPossible
  }
  // runVirtualStockMath(recipe: any): number {
  //   if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0)
  //     return 0

  //   let minPossible = Infinity

  //   // Aseguramos que el rendimiento de la receta no sea 0 para no romper la división
  //   const recipeYield = Number(recipe.yieldQuantity) || 1

  //   for (const ingredient of recipe.ingredients) {
  //     // 1. Validar que el objeto del ítem existe (evita crash si el loader falló)
  //     if (!ingredient.ingredientItem) continue

  //     const stockAvailable = Number(ingredient.ingredientItem.stock) || 0

  //     // 2. Seguridad: Evitar división por cero en la conversión
  //     const conversion =
  //       Number(ingredient.ingredientItem.conversionToBaseQty) || 1

  //     // 3. Calcular cantidad necesaria para 1 unidad final
  //     // qtyRequired / rendimiento / conversion
  //     const qtyNeededPerUnit =
  //       ingredient.quantityRequired / recipeYield / conversion

  //     // 4. Solo procesamos si la cantidad necesaria es válida y mayor a cero
  //     if (qtyNeededPerUnit > 0) {
  //       const possibleWithThisIng = Math.floor(
  //         stockAvailable / qtyNeededPerUnit,
  //       )

  //       // El ingrediente con MENOR capacidad es el limitante (cuello de botella)
  //       if (possibleWithThisIng < minPossible) {
  //         minPossible = possibleWithThisIng
  //       }
  //     }
  //   }

  //   // Si nunca entró al loop o todos eran Infinity, devolvemos 0
  //   return minPossible === Infinity ? 0 : minPossible
  // }

  /**
   * Calcula cuánto se puede producir de un ítem basado en sus insumos actuales.
   * Devuelve el stock "virtual" adicional que podría fabricarse.
   */
  async calculateVirtualStock(userId: string, item: Item): Promise<number> {
    if (!item.isProduced) return 0

    const recipe = await this.findByFinalProductId(item.id, userId)
    if (!recipe || !recipe.ingredients?.length) return 0

    let minPossible = Infinity

    for (const ingredient of recipe.ingredients) {
      const stockAvailable = Number(ingredient.ingredientItem.stock || 0)

      // Cantidad real necesaria en la unidad en la que está expresado el stock
      const factor = ingredient.ingredientItem.conversionToBaseQty || 1
      const qtyNeededPerUnit =
        ingredient.quantityRequired / factor / recipe.yieldQuantity

      if (qtyNeededPerUnit > 0) {
        const possibleWithThisIng = Math.floor(
          stockAvailable / qtyNeededPerUnit,
        )
        if (possibleWithThisIng < minPossible) {
          minPossible = possibleWithThisIng
        }
      }
    }

    return minPossible === Infinity ? 0 : minPossible
  }
  // async calculateVirtualStock(userId: string, item: Item): Promise<number> {
  //   // 1. Si el ítem no tiene el flag de producción activado, no calculamos nada.
  //   if (!item.isProduced) return 0

  //   // 2. Buscamos la receta vinculada
  //   const recipe = await this.findByFinalProductId(item.id, userId)

  //   // 3. Si no tiene receta cargada o no tiene ingredientes, el stock virtual es 0
  //   if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0)
  //     return 0

  //   let minPossible = Infinity

  //   for (const ingredient of recipe.ingredients) {
  //     // Aseguramos el casteo a número por la naturaleza del tipo numeric en Postgres
  //     const stockAvailable = Number(ingredient.ingredientItem.stock)

  //     // Cantidad de ingrediente necesaria para 1 unidad de producto final
  //     // (Factorizando rendimiento de receta y conversión de unidad del ingrediente)
  //     const qtyNeededPerUnit =
  //       ingredient.quantityRequired /
  //       recipe.yieldQuantity /
  //       ingredient.ingredientItem.conversionToBaseQty

  //     if (qtyNeededPerUnit > 0) {
  //       const possibleWithThisIng = Math.floor(
  //         stockAvailable / qtyNeededPerUnit,
  //       )

  //       // El ingrediente con MENOR capacidad es el limitante (cuello de botella)
  //       if (possibleWithThisIng < minPossible) {
  //         minPossible = possibleWithThisIng
  //       }
  //     }
  //   }

  //   return minPossible === Infinity ? 0 : minPossible
  // }

  async syncRecipeCostsByIngredient(
    userId: string,
    ingredientId: string,
    externalRunner: QueryRunner,
  ): Promise<void> {
    // Buscamos recetas que consuman el item que cambió
    const recipesUsingItem = await externalRunner.manager.find(Recipe, {
      where: { ingredients: { ingredientItemId: ingredientId }, userId },
      relations: ['ingredients', 'ingredients.ingredientItem'],
    })

    for (const recipe of recipesUsingItem) {
      let totalRecipeCost = 0

      for (const ing of recipe.ingredients) {
        const item = ing.ingredientItem
        const factor = item.conversionToBaseQty || 1
        const qtyInBaseUnit = ing.quantityRequired / factor

        totalRecipeCost += (Number(item.costPrice) || 0) * qtyInBaseUnit
      }

      const newUnitCost = Math.round(totalRecipeCost / recipe.yieldQuantity)

      // Actualizar el item final de esta receta
      await externalRunner.manager.update(Item, recipe.finalProductId, {
        costPrice: newUnitCost,
      })

      // RECURSIÓN: Disparar actualización para los que dependen de este producto final
      await this.syncRecipeCostsByIngredient(
        userId,
        recipe.finalProductId,
        externalRunner,
      )
    }
  }

  // async syncRecipeCostsByIngredient(
  //   userId: string,
  //   ingredientId: string,
  //   externalRunner: QueryRunner,
  // ): Promise<void> {
  //   // 1. Buscamos todas las recetas que usan este ingrediente
  //   // Importante: Cargamos 'ingredients' y sus ítems para tener los costos actuales de los OTROS componentes
  //   const recipesUsingItem = await externalRunner.manager.find(Recipe, {
  //     where: { ingredients: { ingredientItemId: ingredientId }, userId },
  //     relations: ['ingredients', 'ingredients.ingredientItem'],
  //   })

  //   for (const recipe of recipesUsingItem) {
  //     let totalRecipeCost = 0

  //     for (const ing of recipe.ingredients) {
  //       // Usamos el costo del ítem (que ya debe estar actualizado en la DB en este punto)
  //       // Ojo: Si el ing.ingredientItem es el que acaba de cambiar, el runner ya tiene el dato fresco
  //       const cost = Number(ing.ingredientItem.costPrice) || 0
  //       totalRecipeCost += cost * ing.quantityRequired
  //     }

  //     const newUnitCost = Number(
  //       (totalRecipeCost / recipe.yieldQuantity).toFixed(2),
  //     )

  //     // 2. Actualizamos el costo del producto final de la receta
  //     await externalRunner.manager.update(Item, recipe.finalProductId, {
  //       costPrice: newUnitCost,
  //     })

  //     // 3. RECURSIÓN: Si este producto final es a su vez ingrediente de OTRA receta,
  //     // debemos disparar el mismo proceso para esa otra receta (Efecto dominó)
  //     await this.syncRecipeCostsByIngredient(
  //       userId,
  //       recipe.finalProductId,
  //       externalRunner,
  //     )
  //   }
  // }
}
