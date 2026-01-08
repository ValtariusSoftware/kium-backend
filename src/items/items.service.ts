import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, QueryRunner, In } from 'typeorm'
import { Item } from './entities/item.entity'
import { AccessLevel } from '../users/entities/user.entity' // Asumiendo que esta es la ruta correcta
import {
  BulkItemError,
  BulkItemResponse,
  CreateItemInput,
} from './dto/create-item.dto'
import { RecipesService } from 'src/recipes/recipes.service'
import { ProduceItemInput } from './dto/produce-item.dto'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { GraphQLError } from 'graphql'
import { ItemsFilterInput, StockStatusFilter } from './dto/items-filter.input'
import { BulkUpdateItemInput, UpdateItemInput } from './dto/update-item.input'
import { PaginatedItems } from './types/paginated-items.type'
import { PaginationInput } from 'src/common/dto/pagination.input'
import {
  BatchSimulationResponse,
  IngredientConsumption,
  SimulatedItem,
  StockAlert,
} from './dto/simulate-production.output'

interface DatabaseError extends Error {
  code?: string
  detail?: string
}
@Injectable()
export class ItemsService {
  // Límites de capacidad total
  private readonly ITEM_LIMIT_FREE = 25
  private readonly ITEM_LIMIT_PRO = 500

  // Límites de operación (Carga Masiva)
  private readonly BATCH_LIMIT_FREE = 10
  private readonly BATCH_LIMIT_PRO = 50

  constructor(
    @InjectRepository(Item)
    private itemsRepository: Repository<Item>,
    private readonly dataSource: DataSource, // <-- Inyectar DataSource
    @Inject(forwardRef(() => RecipesService))
    private readonly recipesService: RecipesService,
    @Inject(forwardRef(() => InventoryTransactionsService))
    private readonly inventoryTransactionsService: InventoryTransactionsService,
  ) {}

  private calculateItemRoles(
    costPrice: number | null | undefined,
    salePrice: number | null | undefined,
  ) {
    const hasCost = !!costPrice && costPrice > 0
    const hasSale = !!salePrice && salePrice > 0

    return {
      isSaleable: hasSale,
      isPurchasable: hasCost || (!hasSale && !hasCost), // Comprable si tiene costo O si está vacío (insumo incompleto)
      isIngredient: hasCost && !hasSale, // Insumo puro
      isProduced: hasSale && !hasCost, // Producto producido (sin costo manual)
    }
  }

  /**
   * Captura errores específicos de la base de datos (Postgres)
   * y los transforma en excepciones amigables para el usuario.
   */
  private handleDuplicateError(err: unknown): void {
    // Primero casteamos a nuestro tipo para poder leer las propiedades
    const dbError = err as DatabaseError

    // Código 23505: Violación de restricción única (Unique Violation)
    if (dbError.code === '23505') {
      const detail = dbError.detail || ''
      let message = 'Ya existe un ítem con esos datos en tu catálogo.'

      if (detail.includes('sku')) {
        message =
          'El SKU ingresado ya está registrado. Por favor, usa uno diferente.'
      } else if (detail.includes('barcode')) {
        message = 'Ese código de barras ya pertenece a otro producto.'
      }

      throw new ForbiddenException(message)
    }
  }

  /**
   * Crea un nuevo ítem, aplicando la validación de límite FREE/PRO,
   * y registra la entrada de stock inicial de forma atómica.
   * @param userId El ID del usuario creador.
   * @param accessLevel Nivel de suscripción.
   * @param createItemInput Datos del ítem a crear.
   * @returns El ítem creado y actualizado.
   */
  async create(
    userId: string,
    accessLevel: AccessLevel,
    createItemInput: CreateItemInput,
  ): Promise<Item> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. Validar Límite de suscripción
      const itemCount = await queryRunner.manager.count(Item, {
        where: { userId },
      })
      if (
        accessLevel === AccessLevel.FREE &&
        itemCount >= this.ITEM_LIMIT_FREE
      ) {
        throw new ForbiddenException(
          `Límite alcanzado. Máximo ${this.ITEM_LIMIT_FREE} ítems.`,
        )
      }

      // 2. Inferencia de Roles basada en Precios
      const roles = this.calculateItemRoles(
        createItemInput.costPrice,
        createItemInput.salePrice,
      )

      const initialStock = createItemInput.stock || 0.0

      const itemDataToCreate = {
        ...createItemInput,
        ...roles,
        stock: 0.0, // Stock inicial siempre 0 para auditar vía movimiento
        userId,
      }

      // 3. Creación y Guardado
      const newItem = queryRunner.manager.create(Item, itemDataToCreate)
      const savedItem = await queryRunner.manager.save(newItem)

      // 4. Registro de stock inicial si aplica
      if (initialStock > 0) {
        await this.inventoryTransactionsService.registerMovement(
          userId,
          {
            itemId: savedItem.id,
            type: TransactionType.INITIAL_INVENTORY,
            quantity: initialStock,
            unitCostSnapshot: createItemInput.costPrice || 0,
            documentRef: 'INITIAL',
            notes: 'Inventario inicial al crear el ítem.',
          },
          queryRunner,
        )
      }

      await queryRunner.commitTransaction()

      const itemWithFinalStock = await this.itemsRepository.findOne({
        where: { id: savedItem.id },
      })
      if (!itemWithFinalStock)
        throw new NotFoundException('Error: El ítem no se encontró.')

      return itemWithFinalStock
    } catch (err) {
      await queryRunner.rollbackTransaction()
      this.handleDuplicateError(err) // Función para manejar el error 23505 (SKU/Barcode)
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Obtiene la lista de ítems filtrada según los roles (flags) y estados de stock.
   */
  async getItems(
    userId: string,
    filters?: ItemsFilterInput,
    pagination?: PaginationInput,
  ): Promise<PaginatedItems> {
    const query = this.itemsRepository
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })

    // 1. Filtrado por Roles (flags de inferencia)
    // Usamos comparaciones directas con los nuevos booleanos
    if (filters?.isSaleable !== undefined) {
      query.andWhere('item.isSaleable = :isSaleable', {
        isSaleable: filters.isSaleable,
      })
    }

    if (filters?.isProduced !== undefined) {
      query.andWhere('item.isProduced = :isProduced', {
        isProduced: filters.isProduced,
      })
    }

    if (filters?.isIngredient !== undefined) {
      query.andWhere('item.isIngredient = :isIngredient', {
        isIngredient: filters.isIngredient,
      })
    }

    // 2. Filtros de estado de stock (Se mantienen igual, ya que stock es independiente del tipo)
    if (filters?.stockStatus) {
      switch (filters.stockStatus) {
        case StockStatusFilter.OUT_OF_STOCK:
          query.andWhere('item.stock <= 0')
          break

        case StockStatusFilter.LOW_STOCK:
          query
            .andWhere('item.minStockAlert IS NOT NULL')
            .andWhere('item.stock <= item.minStockAlert')
          break

        case StockStatusFilter.AVAILABLE:
          query.andWhere('item.stock > 0')
          break
      }
    }

    // 3. Búsqueda por texto (Nombre, SKU o Barcode)
    if (filters?.search) {
      // Los paréntesis son CLAVE aquí para que Postgres use el índice correctamente
      // junto con el filtro de userId
      query.andWhere(
        '(item.name ILIKE :search OR item.sku ILIKE :search OR item.barcode ILIKE :search)',
        { search: `%${filters.search}%` },
      )
    }

    const limit = pagination?.limit ?? PaginationInput.DEFAULT_LIMIT
    const offset = pagination?.offset ?? PaginationInput.DEFAULT_OFFSET

    query.orderBy('item.name', 'ASC').take(limit).skip(offset)

    // getManyAndCount devuelve los items Y el total de la tabla en un solo viaje
    const [items, total] = await query.getManyAndCount()

    return {
      items,
      total,
    }
  }

  /**
   * Obtiene un ítem por ID, asegurando que pertenezca al usuario especificado.
   * Usado para validaciones de propiedad y existencia.
   */
  async findOne(itemId: string, userId: string): Promise<Item | null> {
    const item = await this.itemsRepository.findOne({
      where: { id: itemId, userId: userId },
    })

    if (!item) {
      // En lugar de lanzar una excepción (que manejaría el resolver),
      // devolvemos null, permitiendo al RecipesService decidir qué error lanzar.
      return null
    }

    return item
  }

  /**
   * Ejecuta la producción de un Producto Final, ajustando los stocks de ingredientes
   * y el producto final dentro de una transacción.
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

      if (!recipe) {
        throw new NotFoundException('Receta no encontrada.')
      }

      const factor = input.quantityToProduce / recipe.yieldQuantity

      // --- 🛡️ 1. PASO DE VALIDACIÓN PREVIA (STOCK ACTUALIZADO) ---
      const missingIngredients: string[] = []

      for (const ingredient of recipe.ingredients) {
        const baseQtyToConsume = ingredient.quantityRequired * factor
        const stockQtyToConsume =
          baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty

        // AJUSTE CRÍTICO: Consultamos el stock actual de la DB usando el runner.
        // Esto permite que el Batch "vea" consumos previos dentro de la misma transacción.
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

      // --- 2. REGISTRO DE CONSUMO ---
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

      // --- 3. PROCESAR ENTRADA DE PRODUCTO FINAL ---
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

      if (!externalRunner) {
        await queryRunner.commitTransaction()
      }

      // Recargamos el ítem final (usando el runner si estamos en batch) para devolverlo
      const updatedItem = await queryRunner.manager.findOne(Item, {
        where: { id: recipe.finalProductId },
      })

      return updatedItem!
    } catch (err) {
      if (!externalRunner) {
        await queryRunner.rollbackTransaction()
      }
      throw err
    } finally {
      if (!externalRunner) {
        await queryRunner.release()
      }
    }
  }
  /**
   * Realiza un ajuste manual de stock para un ítem.
   */
  async adjustStock(userId: string, input: AdjustStockInput): Promise<Item> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const item = await this.findOne(input.itemId, userId)
      if (!item) throw new NotFoundException('Ítem no encontrado.')

      // 🔑 Simplificamos: El frontend ya nos manda el tipo correcto y la cantidad
      // Nos aseguramos de mandar la cantidad como absoluta por si el frontend mandó un menos
      const absoluteQuantity = Math.abs(input.quantity)

      await this.inventoryTransactionsService.registerMovement(
        userId,
        {
          itemId: item.id,
          type: input.type, // 👈 Usamos el tipo que viene del input (ADJUSTMENT_IN/OUT)
          quantity: absoluteQuantity, // 👈 Siempre positivo
          documentRef: 'MANUAL-ADJUST',
          notes: input.reason || 'Ajuste manual de inventario.',
          unitCostSnapshot: item.costPrice || 0,
        },
        queryRunner,
      )

      await queryRunner.commitTransaction()
      return (await this.itemsRepository.findOne({ where: { id: item.id } }))!
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Obtiene la lista de ítems cuyo stock está por debajo del límite de alerta.
   */
  async getLowStockItems(
    userId: string,
    pagination?: PaginationInput,
  ): Promise<PaginatedItems> {
    const limit = pagination?.limit ?? PaginationInput.DEFAULT_LIMIT
    const offset = pagination?.offset ?? PaginationInput.DEFAULT_OFFSET
    const query = this.itemsRepository
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .andWhere('item.minStockAlert IS NOT NULL')
      .andWhere('item.stock <= item.minStockAlert')
      .orderBy('item.stock', 'ASC') // Prioridad: los que están más cerca de cero o negativos
      .addOrderBy('item.name', 'ASC') // Segundo criterio: orden alfabético
      .take(limit)
      .skip(offset)

    const [items, total] = await query.getManyAndCount()

    return {
      items,
      total,
    }
  }

  // Este método solo hace la cuenta, NO va a la base de datos.
  // Es súper rápido porque recibe la receta con todo cargado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runVirtualStockMath(recipe: any): number {
    let minPossible = Infinity

    for (const ingredient of recipe.ingredients) {
      const stockAvailable = Number(ingredient.ingredientItem.stock)
      const qtyNeededPerUnit =
        ingredient.quantityRequired /
        recipe.yieldQuantity /
        ingredient.ingredientItem.conversionToBaseQty

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

  /**
   * Calcula cuánto se puede producir de un ítem basado en sus insumos actuales.
   * Devuelve el stock "virtual" adicional que podría fabricarse.
   */
  async calculateVirtualStock(userId: string, item: Item): Promise<number> {
    // 1. Si el ítem no tiene el flag de producción activado, no calculamos nada.
    if (!item.isProduced) return 0

    // 2. Buscamos la receta vinculada
    const recipe = await this.recipesService.findByFinalProductId(
      item.id,
      userId,
    )

    // 3. Si no tiene receta cargada o no tiene ingredientes, el stock virtual es 0
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0)
      return 0

    let minPossible = Infinity

    for (const ingredient of recipe.ingredients) {
      // Aseguramos el casteo a número por la naturaleza del tipo numeric en Postgres
      const stockAvailable = Number(ingredient.ingredientItem.stock)

      // Cantidad de ingrediente necesaria para 1 unidad de producto final
      // (Factorizando rendimiento de receta y conversión de unidad del ingrediente)
      const qtyNeededPerUnit =
        ingredient.quantityRequired /
        recipe.yieldQuantity /
        ingredient.ingredientItem.conversionToBaseQty

      if (qtyNeededPerUnit > 0) {
        const possibleWithThisIng = Math.floor(
          stockAvailable / qtyNeededPerUnit,
        )

        // El ingrediente con MENOR capacidad es el limitante (cuello de botella)
        if (possibleWithThisIng < minPossible) {
          minPossible = possibleWithThisIng
        }
      }
    }

    return minPossible === Infinity ? 0 : minPossible
  }

  /**
   * Produce múltiples recetas en una sola transacción.
   */
  async produceItemsBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<Item[]> {
    // Si no hay nada que procesar, salimos rápido
    if (!inputs || inputs.length === 0) return []

    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()

    try {
      const itemIds: string[] = []

      for (const input of inputs) {
        // Pasamos el runner para que todo sea una sola unidad de trabajo
        const updatedItem = await this.produce(userId, input, runner)

        if (!itemIds.includes(updatedItem.id)) {
          itemIds.push(updatedItem.id)
        }
      }

      await runner.commitTransaction()

      // Recargamos los ítems para devolver el estado final (stock, canProduceQuantity, etc.)
      return this.itemsRepository.find({
        where: {
          id: In(itemIds),
          userId, // 🛡️ Siempre filtrar por userId por seguridad
        },
        order: { name: 'ASC' },
      })
    } catch (err) {
      // Si cualquier producción falla, se hace rollback de TODO el lote
      await runner.rollbackTransaction()
      throw err
    } finally {
      await runner.release()
    }
  }

  /**
    Simula el consumo de ingredientes en cascada para un lote de producción,

    permitiendo validar la viabilidad y detectar faltantes sin afectar el stock. 
  */
  async simulateBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<BatchSimulationResponse> {
    const itemsResponse: SimulatedItem[] = []
    const alerts: StockAlert[] = []
    let isViable = true

    // Mapa para trackear el stock disponible durante la simulación "cascada"
    const virtualStockMap = new Map<string, number>()

    for (const input of inputs) {
      // 1. Buscamos la receta usando el recipeId que viene del DTO
      // Nota: Usamos findOne de recipesService para traer las relaciones necesarias
      const recipe = await this.recipesService.findOne(input.recipeId, userId)

      if (!recipe) continue

      // El producto final de esta receta
      const finalProduct = recipe.finalProduct
      const ingredientsUsage: IngredientConsumption[] = []
      let itemCanBeProduced = true

      // 2. Analizamos los ingredientes de la receta
      for (const recipeIng of recipe.ingredients) {
        const ingItem = recipeIng.ingredientItem
        // Usamos 'quantityToProduce' que es el nombre en tu DTO
        const totalRequired =
          Number(recipeIng.quantityRequired) * input.quantityToProduce

        // Inicializamos el stock virtual si es la primera vez que vemos este ingrediente
        if (!virtualStockMap.has(ingItem.id)) {
          virtualStockMap.set(ingItem.id, Number(ingItem.stock))
        }

        const currentAvailable = virtualStockMap.get(ingItem.id) ?? 0

        if (currentAvailable < totalRequired) {
          itemCanBeProduced = false
          isViable = false

          // Registrar alerta de faltante global
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
          // Restamos para el siguiente producto que pueda necesitar este mismo ingrediente
          virtualStockMap.set(ingItem.id, currentAvailable - totalRequired)
        }

        ingredientsUsage.push({
          name: ingItem.name,
          totalUsedForThisItem: Number(totalRequired.toFixed(4)),
          unit: recipeIng.unitOfMeasure,
        })
      }

      // 3. Agregamos el resultado de este ítem al desglose
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

  /**
   * Busca un ítem por su código de barras.
   * Útil para ventas rápidas o ingresos de stock con escáner.
   */
  async findByBarcode(userId: string, barcode: string): Promise<Item | null> {
    return await this.itemsRepository.findOne({
      where: { userId, barcode },
    })
  }

  /**
   * Actualiza los datos de un ítem existente e infiere cambios en sus roles.
   */
  async update(userId: string, input: UpdateItemInput): Promise<Item> {
    const { id, ...updateData } = input

    const item = await this.findOne(id, userId)
    if (!item) {
      throw new NotFoundException(`Ítem con ID ${id} no encontrado.`)
    }

    // 1. Determinar los precios finales (mezclando input con datos existentes)
    const finalCostPrice =
      updateData.costPrice !== undefined ? updateData.costPrice : item.costPrice
    const finalSalePrice =
      updateData.salePrice !== undefined ? updateData.salePrice : item.salePrice

    // 2. Recalcular los roles automáticamente
    const newRoles = this.calculateItemRoles(finalCostPrice, finalSalePrice)

    // 3. Fusionar cambios: updateData pisa los campos viejos y newRoles actualiza la lógica
    Object.assign(item, updateData, newRoles)

    try {
      // 4. Persistir cambios
      return await this.itemsRepository.save(item)
    } catch (err) {
      // 5. Manejar colisiones de SKU o Barcode
      this.handleDuplicateError(err)
      throw err
    }
  }

  /**
   * Crea múltiples ítems permitiendo cargas parciales.
   * Refresca los datos finales desde la DB para devolver el stock real post-transacción.
   */
  async createBulk(
    userId: string,
    accessLevel: AccessLevel,
    inputs: CreateItemInput[],
  ): Promise<BulkItemResponse> {
    // 1. Validar límite del "Paquete" (Batch)
    const batchLimit =
      accessLevel === AccessLevel.PRO
        ? this.BATCH_LIMIT_PRO
        : this.BATCH_LIMIT_FREE
    if (inputs.length > batchLimit) {
      throw new ForbiddenException(
        `Límite de carga masiva excedido (${batchLimit} ítems).`,
      )
    }

    // 2. Validar capacidad total del Plan
    const capacityLimit =
      accessLevel === AccessLevel.PRO
        ? this.ITEM_LIMIT_PRO
        : this.ITEM_LIMIT_FREE
    const currentCount = await this.itemsRepository.count({ where: { userId } })

    const createdItemsIds: string[] = []
    const errorReport: BulkItemError[] = []

    // --- OPTIMIZACIÓN: Un solo QueryRunner para todo el proceso ---
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]

      if (currentCount + createdItemsIds.length >= capacityLimit) {
        errorReport.push({
          row: i + 1,
          name: input.name,
          error: 'Límite de capacidad del plan alcanzado.',
        })
        continue
      }

      // Iniciamos transacción por CADA ítem para permitir carga parcial
      await queryRunner.startTransaction()

      try {
        const roles = this.calculateItemRoles(input.costPrice, input.salePrice)

        const newItem = queryRunner.manager.create(Item, {
          ...input,
          ...roles,
          stock: 0,
          userId,
        })

        const savedItem = await queryRunner.manager.save(newItem)

        if ((input.stock || 0) > 0) {
          await this.inventoryTransactionsService.registerMovement(
            userId,
            {
              itemId: savedItem.id,
              type: TransactionType.INITIAL_INVENTORY,
              quantity: input.stock,
              unitCostSnapshot: input.costPrice || 0,
              documentRef: 'BULK_LOAD',
              notes: 'Carga masiva inicial.',
            },
            queryRunner,
          )
        }

        await queryRunner.commitTransaction()
        createdItemsIds.push(savedItem.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        await queryRunner.rollbackTransaction()

        // Manejo de errores duplicados con tu lógica de códigos Postgres
        let friendlyError = err.message || 'Error interno'
        if (err.code === '23505') {
          friendlyError = err.detail.includes('sku')
            ? 'SKU duplicado'
            : 'Código de barras duplicado'
        }

        errorReport.push({
          row: i + 1,
          name: input.name,
          error: friendlyError,
        })
      }
      // NOTA: No hacemos release() acá, esperamos al final del bucle
    }

    await queryRunner.release() // Cerramos la conexión al terminar todo

    // --- REFRESCO FINAL ---
    const finalCreatedItems =
      createdItemsIds.length > 0
        ? await this.itemsRepository.find({
            where: { id: In(createdItemsIds) },
            order: { name: 'ASC' },
          })
        : []

    return { created: finalCreatedItems, errors: errorReport }
  }

  /**
   * Realiza un borrado lógico (Soft Delete) del ítem.
   * Valida integridad: No permite borrar si el ítem es ingrediente de una receta.
   */
  async remove(id: string, userId: string): Promise<boolean> {
    const item = await this.findOne(id, userId)
    if (!item) {
      throw new NotFoundException(`Ítem con ID ${id} no encontrado.`)
    }

    // 1. Validar si es parte de una receta antes de borrar
    const isUsed = await this.recipesService.isItemInAnyRecipe(id, userId)

    if (isUsed) {
      throw new ForbiddenException(
        `No se puede eliminar "${item.name}" porque es ingrediente de una receta activa.`,
      )
    }

    // 2. Borrado lógico (Soft Delete)
    // Esto setea deleted_at y libera el SKU y el cupo del plan Free.
    await this.itemsRepository.softRemove(item)

    return true
  }

  /**
   * Elimina múltiples ítems validando que el usuario sea PRO.
   */
  async removeBulk(
    userId: string,
    accessLevel: AccessLevel,
    ids: string[],
  ): Promise<boolean> {
    // 1. Validación de Nivel de Acceso
    if (accessLevel !== AccessLevel.PRO) {
      throw new ForbiddenException(
        'La eliminación masiva es una función exclusiva para usuarios PRO.',
      )
    }

    // 2. Validación de Límite de Lote (Batch)
    // Reutilizamos la constante de 50 que definiste arriba
    if (ids.length > this.BATCH_LIMIT_PRO) {
      throw new ForbiddenException(
        `No puedes eliminar más de ${this.BATCH_LIMIT_PRO} ítems a la vez.`,
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      for (const id of ids) {
        // Buscamos el ítem dentro de la transacción
        const item = await queryRunner.manager.findOne(Item, {
          where: { id, userId },
        })

        if (!item) {
          throw new NotFoundException(`Ítem con ID ${id} no encontrado.`)
        }

        // Validar si es ingrediente de alguna receta
        const isUsed = await this.recipesService.isItemInAnyRecipe(id, userId)
        if (isUsed) {
          throw new ForbiddenException(
            `Operación cancelada: "${item.name}" es ingrediente de una receta activa.`,
          )
        }

        // Soft Delete (Borrado lógico) dentro de la transacción
        await queryRunner.manager.softRemove(item)
      }

      // Si todo salió bien con los N ítems, confirmamos
      await queryRunner.commitTransaction()
      return true
    } catch (err) {
      // Si uno falla (ej. es ingrediente), no se borra ninguno
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Actualiza múltiples ítems validando que el usuario sea PRO.
   */
  async updateBulk(
    userId: string,
    accessLevel: AccessLevel,
    inputs: BulkUpdateItemInput[],
  ): Promise<Item[]> {
    // 1. Validación de Nivel de Acceso
    if (accessLevel !== AccessLevel.PRO) {
      throw new ForbiddenException(
        'La actualización masiva es exclusiva para usuarios PRO.',
      )
    }

    // 2. Validación de Límite de Lote (Batch) - Usando la constante
    if (inputs.length > this.BATCH_LIMIT_PRO) {
      throw new ForbiddenException(
        `No puedes actualizar más de ${this.BATCH_LIMIT_PRO} ítems a la vez.`,
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      let currentRow = 0

      for (const input of inputs) {
        currentRow++

        const item = await queryRunner.manager.findOne(Item, {
          where: { id: input.id, userId },
        })

        if (!item) {
          throw new Error(
            `Fila ${currentRow}: El ítem con ID "${input.id}" no existe en tu catálogo.`,
          )
        }

        // --- Limpieza y Mapeo ---
        const cleanData: Partial<BulkUpdateItemInput> = {}
        const keys = Object.keys(input) as Array<keyof BulkUpdateItemInput>
        for (const key of keys) {
          if (key !== 'id' && input[key] !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(cleanData as any)[key] = input[key]
          }
        }

        // --- Recalcular roles si cambian precios ---
        if (
          cleanData.costPrice !== undefined ||
          cleanData.salePrice !== undefined
        ) {
          const finalCost = cleanData.costPrice ?? item.costPrice
          const finalSale = cleanData.salePrice ?? item.salePrice
          const newRoles = this.calculateItemRoles(
            finalCost as number | null,
            finalSale as number | null,
          )
          Object.assign(item, newRoles)
        }

        Object.assign(item, cleanData)

        // Guardado dentro de la transacción (valida constraints)
        await queryRunner.manager.save(item)
      }

      // Si todo el bucle terminó sin errores, confirmamos
      await queryRunner.commitTransaction()

      // Devolvemos los datos frescos
      return this.itemsRepository.find({
        where: { id: In(inputs.map((i) => i.id)), userId },
        order: { name: 'ASC' },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      // Si falla uno, rollback de TODO el lote
      await queryRunner.rollbackTransaction()

      let friendlyError = err.message || 'Error en la actualización'

      if (err.code === '23505') {
        const field = err.detail.includes('sku') ? 'SKU' : 'Código de barras'
        friendlyError = `Error de duplicado: Un ${field} en tu lista ya existe en otro producto.`
      }

      throw new ForbiddenException({
        message: 'La actualización masiva falló y no se guardó ningún cambio.',
        detail: friendlyError,
      })
    } finally {
      await queryRunner.release()
    }
  }
}
