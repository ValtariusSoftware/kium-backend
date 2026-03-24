// src/production/production.service.ts

import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common'
import { DataSource, QueryRunner } from 'typeorm'

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
import { ItemErrorCode } from 'src/items/enums/item-error-code.enum'
import { BulkItemError, BulkItemResponse } from 'src/items/dto/create-item.dto'

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
      const recipe = await this.recipesService.findByFinalProductId(
        input.itemId,
        userId,
      )
      if (!recipe) throw new NotFoundException(ItemErrorCode.ITEM_NOT_FOUND)

      const factor = input.quantityToProduce / recipe.yieldQuantity
      const missingIngredients: string[] = []
      let totalProductionCost = 0 // Para calcular el nuevo costo del producto final

      // --- 1. VALIDACIÓN DE STOCK ---
      for (const ingredient of recipe.ingredients) {
        const stockQtyToConsume =
          (ingredient.quantityRequired * factor) /
          ingredient.ingredientItem.conversionToBaseQty

        const dbItem = await queryRunner.manager.findOne(Item, {
          where: { id: ingredient.ingredientItemId },
          lock: { mode: 'pessimistic_write' },
        })

        if (Number(dbItem?.stock || 0) < stockQtyToConsume) {
          missingIngredients.push(ingredient.ingredientItem.name)
        }
      }

      if (missingIngredients.length > 0) {
        throw new BadRequestException({
          message: ItemErrorCode.INSUFFICIENT_STOCK,
          details: missingIngredients,
        })
      }

      // --- 2. CONSUMO DE INGREDIENTES Y CÁLCULO DE COSTO ---
      for (const ingredient of recipe.ingredients) {
        const stockQtyToConsume =
          (ingredient.quantityRequired * factor) /
          ingredient.ingredientItem.conversionToBaseQty

        // Usamos el costo actual del ingrediente
        const ingredientUnitCost = Number(
          ingredient.ingredientItem.costPrice || 0,
        )
        totalProductionCost += stockQtyToConsume * ingredientUnitCost

        await this.inventoryTransactionsService.registerMovement(
          userId,
          {
            itemId: ingredient.ingredientItemId,
            type: TransactionType.CONSUMPTION,
            quantity: stockQtyToConsume,
            documentRef: `PROD-RECIPE-${recipe.id}`,
            notes: `Insumo para ${input.quantityToProduce} ${recipe.finalProduct.name}`,
            unitCostSnapshot: ingredientUnitCost,
          },
          queryRunner,
        )
      }

      // --- 3. ENTRADA DE PRODUCTO TERMINADO ---
      const stockQtyProduced =
        input.quantityToProduce / recipe.finalProduct.conversionToBaseQty

      // El costo unitario producido es el total de ingredientes / cantidad producida
      const unitCostOfProducedItem = Math.round(
        totalProductionCost / stockQtyProduced,
      )

      await this.inventoryTransactionsService.registerMovement(
        userId,
        {
          itemId: recipe.finalProductId,
          type: TransactionType.PRODUCTION_IN,
          quantity: stockQtyProduced,
          unitCostSnapshot: unitCostOfProducedItem,
          documentRef: `PROD-RECIPE-${recipe.id}`,
          notes: `Producción de ${input.quantityToProduce} unidades finalizada.`,
        },
        queryRunner,
      )

      if (!externalRunner) await queryRunner.commitTransaction()

      const updatedItem = await queryRunner.manager.findOne(Item, {
        where: { id: recipe.finalProductId },
      })

      return updatedItem!
    } catch (err) {
      if (!externalRunner) await queryRunner.rollbackTransaction()
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      )
        throw err
      throw new InternalServerErrorException(ItemErrorCode.INTERNAL_ERROR)
    } finally {
      if (!externalRunner) await queryRunner.release()
    }
  }
  // async produce(
  //   userId: string,
  //   input: ProduceItemInput,
  //   externalRunner?: QueryRunner,
  // ): Promise<Item> {
  //   const queryRunner = externalRunner || this.dataSource.createQueryRunner()

  //   if (!externalRunner) {
  //     await queryRunner.connect()
  //     await queryRunner.startTransaction()
  //   }

  //   try {
  //     // const recipe = await this.recipesService.findOne(input.recipeId, userId)
  //     const recipe = await this.recipesService.findByFinalProductId(
  //       input.itemId,
  //       userId,
  //     )
  //     if (!recipe) throw new NotFoundException(ItemErrorCode.ITEM_NOT_FOUND)

  //     const factor = input.quantityToProduce / recipe.yieldQuantity

  //     // --- 1. VALIDACIÓN DE STOCK ---
  //     const missingIngredients: string[] = []

  //     for (const ingredient of recipe.ingredients) {
  //       const baseQtyToConsume = ingredient.quantityRequired * factor
  //       const stockQtyToConsume =
  //         baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty

  //       const dbItem = await queryRunner.manager.findOne(Item, {
  //         where: { id: ingredient.ingredientItemId },
  //         lock: { mode: 'pessimistic_write' },
  //       })

  //       const currentStock = Number(dbItem?.stock || 0)
  //       if (currentStock < stockQtyToConsume) {
  //         missingIngredients.push(ingredient.ingredientItem.name)
  //       }
  //     }

  //     // Si falta stock, lanzamos la excepción estructurada para el Filtro
  //     if (missingIngredients.length > 0) {
  //       throw new BadRequestException({
  //         message: ItemErrorCode.INSUFFICIENT_STOCK,
  //         details: missingIngredients, // Android recibirá esto para mostrar qué falta
  //       })
  //     }

  //     // --- 2. REGISTRO DE CONSUMO DE INGREDIENTES ---
  //     for (const ingredient of recipe.ingredients) {
  //       const baseQtyToConsume = ingredient.quantityRequired * factor
  //       const stockQtyToConsume =
  //         baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty
  //       const ingredientUnitCost = Number(
  //         ingredient.ingredientItem.costPrice || 0,
  //       )

  //       await this.inventoryTransactionsService.registerMovement(
  //         userId,
  //         {
  //           itemId: ingredient.ingredientItemId,
  //           type: TransactionType.CONSUMPTION,
  //           quantity: stockQtyToConsume,
  //           documentRef: `PROD-RECIPE-${recipe.id}`,
  //           notes: `Consumo para producir ${input.quantityToProduce} unidades de ${recipe.finalProduct.name}.`,
  //           unitCostSnapshot: ingredientUnitCost,
  //         },
  //         queryRunner,
  //       )
  //     }

  //     // --- 3. ENTRADA DE PRODUCTO TERMINADO ---
  //     const stockQtyProduced =
  //       input.quantityToProduce / recipe.finalProduct.conversionToBaseQty
  //     const currentFinalProductCost = Number(recipe.finalProduct.costPrice || 0)

  //     await this.inventoryTransactionsService.registerMovement(
  //       userId,
  //       {
  //         itemId: recipe.finalProductId,
  //         type: TransactionType.PRODUCTION_IN,
  //         quantity: stockQtyProduced,
  //         unitCostSnapshot: currentFinalProductCost,
  //         documentRef: `PROD-RECIPE-${recipe.id}`,
  //         notes: `Producción finalizada de ${input.quantityToProduce} unidades.`,
  //       },
  //       queryRunner,
  //     )

  //     if (!externalRunner) await queryRunner.commitTransaction()

  //     // Devolvemos el ítem actualizado
  //     const updatedItem = await queryRunner.manager.findOne(Item, {
  //       where: { id: recipe.finalProductId },
  //     })

  //     return updatedItem!
  //   } catch (err) {
  //     if (!externalRunner) await queryRunner.rollbackTransaction()

  //     // Si ya es un error estructurado de Nest (nuestro BadRequest de arriba), lo relanzamos
  //     if (
  //       err instanceof BadRequestException ||
  //       err instanceof NotFoundException
  //     ) {
  //       throw err
  //     }

  //     // Si es un error inesperado, lanzamos error interno
  //     throw new InternalServerErrorException(ItemErrorCode.INTERNAL_ERROR)
  //   } finally {
  //     if (!externalRunner) await queryRunner.release()
  //   }
  // }

  /**
   * Produce múltiples recetas en una sola transacción atómica.
   */
  async produceItemsBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<BulkItemResponse> {
    if (!inputs || inputs.length === 0) return { created: [], errors: [] }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()

    const createdItems: Item[] = []
    const errorReport: BulkItemError[] = []

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]

      // Intentamos obtener el nombre del producto para el reporte de errores
      let itemName = `Producto #${i + 1}`

      await queryRunner.startTransaction()
      try {
        const updatedItem = await this.produce(userId, input, queryRunner)
        await queryRunner.commitTransaction()

        itemName = updatedItem.name
        createdItems.push(updatedItem)
      } catch (err: any) {
        await queryRunner.rollbackTransaction()

        const errorCode =
          err.response?.message || err.message || ItemErrorCode.INTERNAL_ERROR
        const details = err.response?.details || null

        errorReport.push({
          row: i + 1,
          name: itemName,
          error: errorCode,
          details: details, // Aquí van los ingredientes faltantes
        })
      }
    }

    await queryRunner.release()

    if (errorReport.length > 0) {
      throw new BadRequestException({
        message: ItemErrorCode.BULK_PARTIAL_SUCCESS,
        details: errorReport,
      })
    }

    return { created: createdItems, errors: [] }
  }
  // async produceItemsBatch(
  //   userId: string,
  //   inputs: ProduceItemInput[],
  // ): Promise<BulkItemResponse> {
  //   // Cambiamos el retorno a BulkItemResponse
  //   if (!inputs || inputs.length === 0) return { created: [], errors: [] }

  //   const queryRunner = this.dataSource.createQueryRunner()
  //   await queryRunner.connect()

  //   const createdItems: Item[] = []
  //   const errorReport: BulkItemError[] = []

  //   for (let i = 0; i < inputs.length; i++) {
  //     const input = inputs[i]

  //     // Iniciamos transacción por CADA ítem para permitir éxito/fallo individual
  //     await queryRunner.startTransaction()
  //     try {
  //       const updatedItem = await this.produce(userId, input, queryRunner)
  //       await queryRunner.commitTransaction()

  //       createdItems.push(updatedItem)
  //     } catch (err: any) {
  //       await queryRunner.rollbackTransaction()

  //       // Extraemos el código de error y los detalles si existen
  //       const errorCode = err.response?.message || ItemErrorCode.INTERNAL_ERROR
  //       const details = err.response?.details || null

  //       errorReport.push({
  //         row: i + 1,
  //         name: input.itemId, // O el nombre del producto si lo tienes a mano
  //         error: errorCode,
  //         details: details, // Aquí viajarán los nombres de los ingredientes faltantes
  //       })
  //     }
  //   }

  //   await queryRunner.release()

  //   // Si hubo errores, lanzamos la excepción estructurada para que el filtro
  //   // la envíe a Android con el código BULK_PARTIAL_SUCCESS
  //   if (errorReport.length > 0) {
  //     throw new BadRequestException({
  //       message: ItemErrorCode.BULK_PARTIAL_SUCCESS,
  //       details: errorReport,
  //     })
  //   }

  //   return { created: createdItems, errors: [] }
  // }
  // async produceItemsBatch(
  //   userId: string,
  //   inputs: ProduceItemInput[],
  // ): Promise<Item[]> {
  //   if (!inputs || inputs.length === 0) return []

  //   const runner = this.dataSource.createQueryRunner()
  //   await runner.connect()
  //   await runner.startTransaction()

  //   try {
  //     const itemIds: string[] = []

  //     for (const input of inputs) {
  //       const updatedItem = await this.produce(userId, input, runner)
  //       if (!itemIds.includes(updatedItem.id)) {
  //         itemIds.push(updatedItem.id)
  //       }
  //     }

  //     await runner.commitTransaction()

  //     // Buscamos los items finales para devolver el estado actual post-transacción
  //     return await this.dataSource.getRepository(Item).find({
  //       where: { id: In(itemIds), userId },
  //       order: { name: 'ASC' },
  //     })
  //   } catch (err) {
  //     await runner.rollbackTransaction()
  //     throw err
  //   } finally {
  //     await runner.release()
  //   }
  // }

  /**
   * Simula el impacto en stock de un lote de producción sin persistir cambios.
   */
  async simulateBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<BatchSimulationResponse> {
    const itemsResponse: SimulatedItem[] = []
    const alertsMap = new Map<string, StockAlert>() // Usamos Map para agrupar alertas
    let isViable = true

    // Mapa para seguir el stock virtual mientras descontamos
    const virtualStockMap = new Map<string, number>()

    for (const input of inputs) {
      const recipe = await this.recipesService.findByFinalProductId(
        input.itemId,
        userId,
      )

      if (!recipe) continue

      const finalProduct = recipe.finalProduct
      const ingredientsUsage: IngredientConsumption[] = []
      let itemCanBeProduced = true

      for (const recipeIng of recipe.ingredients) {
        const ingItem = recipeIng.ingredientItem
        const factor = input.quantityToProduce / recipe.yieldQuantity

        // Calculamos la cantidad necesaria con precisión
        const totalRequired = Number(
          (
            (recipeIng.quantityRequired * factor) /
            ingItem.conversionToBaseQty
          ).toFixed(4),
        )

        // Si no está en nuestro mapa virtual, cargamos el stock real inicial
        if (!virtualStockMap.has(ingItem.id)) {
          virtualStockMap.set(ingItem.id, Number(ingItem.stock))
        }

        const currentAvailable = virtualStockMap.get(ingItem.id) ?? 0

        if (currentAvailable < totalRequired) {
          itemCanBeProduced = false
          isViable = false

          // Calculamos cuánto falta sumando a lo que ya faltaba antes para este ingrediente
          const missingForThisStep = totalRequired - currentAvailable

          if (alertsMap.has(ingItem.id)) {
            const existingAlert = alertsMap.get(ingItem.id)!
            existingAlert.missingQuantity = Number(
              (existingAlert.missingQuantity + missingForThisStep).toFixed(2),
            )
          } else {
            alertsMap.set(ingItem.id, {
              ingredientName: ingItem.name,
              missingQuantity: Number(missingForThisStep.toFixed(2)),
              unit: recipeIng.unitOfMeasure,
            })
          }

          // El stock virtual queda en 0 porque ya no hay más para futuros ítems del batch
          virtualStockMap.set(ingItem.id, 0)
        } else {
          // Descontamos del stock virtual con precisión
          virtualStockMap.set(
            ingItem.id,
            Number((currentAvailable - totalRequired).toFixed(4)),
          )
        }

        ingredientsUsage.push({
          name: ingItem.name,
          totalUsedForThisItem: totalRequired,
          unit: recipeIng.unitOfMeasure,
        })
      }

      itemsResponse.push({
        itemId: recipe.finalProductId,
        itemName: finalProduct?.name ?? 'Desconocido',
        requestedQuantity: input.quantityToProduce,
        ingredientsUsage,
        hasInsufficientStock: !itemCanBeProduced,
      })
    }

    return {
      isViable,
      items: itemsResponse,
      alerts: Array.from(alertsMap.values()), // Convertimos el Map a Array para el cliente
    }
  }
  // async simulateBatch(
  //   userId: string,
  //   inputs: ProduceItemInput[],
  // ): Promise<BatchSimulationResponse> {
  //   const itemsResponse: SimulatedItem[] = []
  //   const alerts: StockAlert[] = []
  //   let isViable = true

  //   const virtualStockMap = new Map<string, number>()

  //   for (const input of inputs) {
  //     // const recipe = await this.recipesService.findOne(input.recipeId, userId)
  //     const recipe = await this.recipesService.findByFinalProductId(
  //       input.itemId,
  //       userId,
  //     )
  //     if (!recipe) continue

  //     const finalProduct = recipe.finalProduct
  //     const ingredientsUsage: IngredientConsumption[] = []
  //     let itemCanBeProduced = true

  //     for (const recipeIng of recipe.ingredients) {
  //       const ingItem = recipeIng.ingredientItem
  //       const factor = input.quantityToProduce / recipe.yieldQuantity
  //       const totalRequired =
  //         (recipeIng.quantityRequired * factor) / ingItem.conversionToBaseQty

  //       if (!virtualStockMap.has(ingItem.id)) {
  //         virtualStockMap.set(ingItem.id, Number(ingItem.stock))
  //       }

  //       const currentAvailable = virtualStockMap.get(ingItem.id) ?? 0

  //       if (currentAvailable < totalRequired) {
  //         itemCanBeProduced = false
  //         isViable = false

  //         const alreadyAlerted = alerts.find(
  //           (a) => a.ingredientName === ingItem.name,
  //         )
  //         if (!alreadyAlerted) {
  //           alerts.push({
  //             ingredientName: ingItem.name,
  //             missingQuantity: Number(
  //               (totalRequired - currentAvailable).toFixed(2),
  //             ),
  //             unit: recipeIng.unitOfMeasure,
  //           })
  //         }
  //       } else {
  //         virtualStockMap.set(ingItem.id, currentAvailable - totalRequired)
  //       }

  //       ingredientsUsage.push({
  //         name: ingItem.name,
  //         totalUsedForThisItem: Number(totalRequired.toFixed(4)),
  //         unit: recipeIng.unitOfMeasure,
  //       })
  //     }

  //     itemsResponse.push({
  //       itemId: recipe.finalProductId,
  //       itemName: finalProduct?.name ?? null,
  //       requestedQuantity: input.quantityToProduce,
  //       ingredientsUsage,
  //       hasInsufficientStock: !itemCanBeProduced,
  //     })
  //   }

  //   return { isViable, items: itemsResponse, alerts }
  // }
}
