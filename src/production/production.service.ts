// src/production/production.service.ts

import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common'
import { DataSource, QueryRunner, In } from 'typeorm'
import { GraphQLError } from 'graphql'

// Entidades y DTOs
import { Item } from '../items/entities/item.entity'
import { ProduceItemInput } from './dto/produce-item.dto' // Ajustar ruta según tu carpeta
import {
  BatchSimulationResponse,
  SimulatedItem,
  StockAlert,
  IngredientConsumption,
} from './dto/simulate-production.output' // Ajustar ruta

// Servicios
import { RecipesService } from '../recipes/recipes.service'
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service'
import { TransactionType } from '../inventory-transactions/enums/transaction-type.enum'

@Injectable()
export class ProductionService {
  constructor(
    private readonly dataSource: DataSource,

    @Inject(forwardRef(() => RecipesService))
    private readonly recipesService: RecipesService,

    @Inject(forwardRef(() => InventoryTransactionsService))
    private readonly inventoryTransactionsService: InventoryTransactionsService,
  ) {}

  /**
   * Ejecuta la producción de un Producto Final.
   * Orquestra la validación de stock, consumo de insumos y entrada de producto terminado.
   */
  async produce(
    userId: string,
    input: ProduceItemInput,
    externalRunner?: QueryRunner,
  ): Promise<Item> {
    const queryRunner = externalRunner || this.dataSource.createQueryRunner()

    if (!externalRunner) {
      await queryRunner.connect()
      await queryRunner.startTransaction()
    }

    try {
      const recipe = await this.recipesService.findOne(input.recipeId, userId)
      if (!recipe) throw new NotFoundException('Receta no encontrada.')

      const factor = input.quantityToProduce / recipe.yieldQuantity

      // --- 1. VALIDACIÓN DE STOCK (Usando el runner para consistencia en Batch) ---
      const missingIngredients: string[] = []

      for (const ingredient of recipe.ingredients) {
        const baseQtyToConsume = ingredient.quantityRequired * factor
        const stockQtyToConsume =
          baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty

        const dbItem = await queryRunner.manager.findOne(Item, {
          where: { id: ingredient.ingredientItemId },
        })

        const currentStock = Number(dbItem?.stock || 0)
        if (currentStock < stockQtyToConsume) {
          missingIngredients.push(ingredient.ingredientItem.name)
        }
      }

      if (missingIngredients.length > 0) {
        throw new GraphQLError(
          `Faltan ingredientes para producir ${recipe.finalProduct.name}`,
          {
            extensions: {
              code: 'INSUFFICIENT_INGREDIENTS',
              httpStatus: 400,
              ingredients: missingIngredients,
            },
          },
        )
      }

      // --- 2. REGISTRO DE CONSUMO DE INGREDIENTES ---
      for (const ingredient of recipe.ingredients) {
        const baseQtyToConsume = ingredient.quantityRequired * factor
        const stockQtyToConsume =
          baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty
        const ingredientUnitCost = Number(
          ingredient.ingredientItem.costPrice || 0,
        )

        await this.inventoryTransactionsService.registerMovement(
          userId,
          {
            itemId: ingredient.ingredientItemId,
            type: TransactionType.CONSUMPTION,
            quantity: stockQtyToConsume,
            documentRef: `PROD-RECIPE-${recipe.id}`,
            notes: `Consumo para producir ${input.quantityToProduce} unidades de ${recipe.finalProduct.name}.`,
            unitCostSnapshot: ingredientUnitCost,
          },
          queryRunner,
        )
      }

      // --- 3. ENTRADA DE PRODUCTO TERMINADO ---
      const stockQtyProduced =
        input.quantityToProduce / recipe.finalProduct.conversionToBaseQty
      const currentFinalProductCost = Number(recipe.finalProduct.costPrice || 0)

      await this.inventoryTransactionsService.registerMovement(
        userId,
        {
          itemId: recipe.finalProductId,
          type: TransactionType.PRODUCTION_IN,
          quantity: stockQtyProduced,
          unitCostSnapshot: currentFinalProductCost,
          documentRef: `PROD-RECIPE-${recipe.id}`,
          notes: `Producción finalizada de ${input.quantityToProduce} unidades.`,
        },
        queryRunner,
      )

      if (!externalRunner) await queryRunner.commitTransaction()

      // Devolvemos el ítem actualizado (refrescado de la DB)
      const updatedItem = await queryRunner.manager.findOne(Item, {
        where: { id: recipe.finalProductId },
      })

      return updatedItem!
    } catch (err) {
      if (!externalRunner) await queryRunner.rollbackTransaction()
      throw err
    } finally {
      if (!externalRunner) await queryRunner.release()
    }
  }

  /**
   * Produce múltiples recetas en una sola transacción atómica.
   */
  async produceItemsBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<Item[]> {
    if (!inputs || inputs.length === 0) return []

    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()

    try {
      const itemIds: string[] = []

      for (const input of inputs) {
        const updatedItem = await this.produce(userId, input, runner)
        if (!itemIds.includes(updatedItem.id)) {
          itemIds.push(updatedItem.id)
        }
      }

      await runner.commitTransaction()

      // Buscamos los items finales para devolver el estado actual post-transacción
      return await this.dataSource.getRepository(Item).find({
        where: { id: In(itemIds), userId },
        order: { name: 'ASC' },
      })
    } catch (err) {
      await runner.rollbackTransaction()
      throw err
    } finally {
      await runner.release()
    }
  }

  // Este método solo hace la cuenta, NO va a la base de datos.
  // Es súper rápido porque recibe la receta con todo cargado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // runVirtualStockMath(recipe: any): number {
  //   let minPossible = Infinity

  //   for (const ingredient of recipe.ingredients) {
  //     const stockAvailable = Number(ingredient.ingredientItem.stock)
  //     const qtyNeededPerUnit =
  //       ingredient.quantityRequired /
  //       recipe.yieldQuantity /
  //       ingredient.ingredientItem.conversionToBaseQty

  //     if (qtyNeededPerUnit > 0) {
  //       const possibleWithThisIng = Math.floor(
  //         stockAvailable / qtyNeededPerUnit,
  //       )
  //       if (possibleWithThisIng < minPossible) {
  //         minPossible = possibleWithThisIng
  //       }
  //     }
  //   }
  //   return minPossible === Infinity ? 0 : minPossible
  // }

  /**
   * Calcula cuánto se puede producir de un ítem basado en sus insumos actuales.
   * Devuelve el stock "virtual" adicional que podría fabricarse.
   */
  // async calculateVirtualStock(userId: string, item: Item): Promise<number> {
  //   // 1. Si el ítem no tiene el flag de producción activado, no calculamos nada.
  //   if (!item.isProduced) return 0

  //   // 2. Buscamos la receta vinculada
  //   const recipe = await this.recipesService.findByFinalProductId(
  //     item.id,
  //     userId,
  //   )

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

  /**
   * Simula el impacto en stock de un lote de producción sin persistir cambios.
   */
  async simulateBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<BatchSimulationResponse> {
    const itemsResponse: SimulatedItem[] = []
    const alerts: StockAlert[] = []
    let isViable = true

    const virtualStockMap = new Map<string, number>()

    for (const input of inputs) {
      const recipe = await this.recipesService.findOne(input.recipeId, userId)
      if (!recipe) continue

      const finalProduct = recipe.finalProduct
      const ingredientsUsage: IngredientConsumption[] = []
      let itemCanBeProduced = true

      for (const recipeIng of recipe.ingredients) {
        const ingItem = recipeIng.ingredientItem
        const factor = input.quantityToProduce / recipe.yieldQuantity
        const totalRequired =
          (recipeIng.quantityRequired * factor) / ingItem.conversionToBaseQty

        if (!virtualStockMap.has(ingItem.id)) {
          virtualStockMap.set(ingItem.id, Number(ingItem.stock))
        }

        const currentAvailable = virtualStockMap.get(ingItem.id) ?? 0

        if (currentAvailable < totalRequired) {
          itemCanBeProduced = false
          isViable = false

          const alreadyAlerted = alerts.find(
            (a) => a.ingredientName === ingItem.name,
          )
          if (!alreadyAlerted) {
            alerts.push({
              ingredientName: ingItem.name,
              missingQuantity: Number(
                (totalRequired - currentAvailable).toFixed(2),
              ),
              unit: recipeIng.unitOfMeasure,
            })
          }
        } else {
          virtualStockMap.set(ingItem.id, currentAvailable - totalRequired)
        }

        ingredientsUsage.push({
          name: ingItem.name,
          totalUsedForThisItem: Number(totalRequired.toFixed(4)),
          unit: recipeIng.unitOfMeasure,
        })
      }

      itemsResponse.push({
        itemId: recipe.finalProductId,
        itemName: finalProduct?.name || 'Producto Desconocido',
        requestedQuantity: input.quantityToProduce,
        ingredientsUsage,
        hasInsufficientStock: !itemCanBeProduced,
      })
    }

    return { isViable, items: itemsResponse, alerts }
  }
}
