import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
  ConflictException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, In } from 'typeorm'
import { Item } from './entities/item.entity'
import { AccessLevel } from '../users/entities/user.entity' // Asumiendo que esta es la ruta correcta
import {
  BulkItemError,
  BulkItemResponse,
  CreateItemInput,
} from './dto/create-item.dto'
import { RecipesService } from 'src/recipes/recipes.service'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'
import { ItemsFilterInput, StockStatusFilter } from './dto/items-filter.input'
import { BulkUpdateItemInput, UpdateItemInput } from './dto/update-item.input'
import { PaginatedItems } from './types/paginated-items.type'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { ItemErrorCode } from './enums/item-error-code.enum'
import { RecipeIngredient } from 'src/recipes/entities/recipe-ingredient.entity'
import { Recipe } from 'src/recipes/entities/recipe.entity'

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

  /**
   * Infiere roles basados en precios y estado actual.
   * @param costPrice Precio de costo actual o nuevo
   * @param salePrice Precio de venta actual o nuevo
   * @param currentItem (Opcional) Estado actual del ítem en DB para no pisar flags de recetas
   */
  private calculateItemRoles(
    costPrice: number | null | undefined,
    salePrice: number | null | undefined,
    currentItem?: Item,
  ) {
    const hasCost = !!costPrice && costPrice > 0
    const hasSale = !!salePrice && salePrice > 0

    // Si el ítem ya existe, mantenemos sus flags de "Receta" actuales.
    // Si es nuevo, hacemos una inferencia inicial.
    const isIngredient = currentItem
      ? currentItem.isIngredient
      : hasCost && !hasSale

    const isProduced = currentItem
      ? currentItem.isProduced
      : hasSale && !hasCost

    return {
      isSaleable: hasSale,
      isPurchasable: !isProduced, // Solo se puede "comprar" si no es algo que fabricamos
      isIngredient,
      isProduced,
    }
  }

  /**
   * Captura errores específicos de la base de datos (Postgres)
   * y los transforma en excepciones amigables para el usuario.
   */

  private handleDuplicateError(err: unknown) {
    const error = err as DatabaseError
    if (error.code === '23505') {
      const detail = error.detail?.toLowerCase() || ''
      if (detail.includes('sku'))
        throw new ConflictException(ItemErrorCode.DUPLICATE_SKU)
      if (detail.includes('barcode'))
        throw new ConflictException(ItemErrorCode.DUPLICATE_BARCODE)

      throw new ConflictException(ItemErrorCode.DUPLICATE_ENTRY)
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

    if (!item) return null

    return item
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
      throw new NotFoundException(ItemErrorCode.ITEM_NOT_FOUND)
    }

    // 1. Solo necesitamos recalcular roles si cambia el salePrice
    // (porque el costPrice ahora es "fijo" para este método)
    if (updateData.salePrice !== undefined) {
      const newRoles = this.calculateItemRoles(
        item.costPrice,
        updateData.salePrice,
        item,
      )
      Object.assign(item, newRoles)
    }

    // 2. Fusionar el resto de los datos (nombre, barcode, sku, etc.)
    Object.assign(item, updateData)

    try {
      return await this.itemsRepository.save(item)
    } catch (err) {
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
          error: ItemErrorCode.LIMIT_REACHED, // <-- Usar Enum
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

        let errorCode: string = ItemErrorCode.INTERNAL_ERROR // O un genérico que definas

        if (err.code === '23505') {
          const detail = err.detail?.toLowerCase() || ''
          if (detail.includes('sku')) {
            errorCode = ItemErrorCode.DUPLICATE_SKU
          } else if (detail.includes('barcode')) {
            errorCode = ItemErrorCode.DUPLICATE_BARCODE
          } else {
            errorCode = ItemErrorCode.DUPLICATE_ENTRY
          }
        } else {
          // Si es otro tipo de error, podrías usar el mensaje o un código genérico
          errorCode = err.message || ItemErrorCode.INTERNAL_ERROR
        }

        errorReport.push({
          row: i + 1,
          name: input.name,
          error: errorCode, // <-- Ahora Android recibe el código de error para traducir
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
      throw new NotFoundException(ItemErrorCode.ITEM_NOT_FOUND)
    }

    const isUsed = await this.recipesService.isItemInAnyRecipe(id, userId)

    if (isUsed) {
      // Ya no enviamos el string largo, enviamos el código del Enum
      throw new ForbiddenException(ItemErrorCode.ITEM_IS_INGREDIENT)
    }

    await this.itemsRepository.softRemove(item)
    return true
  }

  /**
   * Elimina múltiples ítems validando que el usuario sea PRO.
   * Si algún ítem es ingrediente de una receta, la operación falla y devuelve los nombres.
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

    // 2. Validación de Límite de Lote
    if (ids.length > this.BATCH_LIMIT_PRO) {
      throw new ForbiddenException(
        `No puedes eliminar más de ${this.BATCH_LIMIT_PRO} ítems a la vez.`,
      )
    }

    // 3. VALIDACIÓN PREVIA (Atómica e Informativa)
    const itemsInRecipes: string[] = []

    // Obtenemos los nombres de los ítems involucrados
    const itemsToCheck = await this.itemsRepository.find({
      where: { id: In(ids), userId },
    })

    for (const item of itemsToCheck) {
      const isUsed = await this.recipesService.isItemInAnyRecipe(
        item.id,
        userId,
      )
      if (isUsed) {
        itemsInRecipes.push(item.name)
      }
    }

    // Si hay al menos un error, disparamos la excepción con los nombres
    if (itemsInRecipes.length > 0) {
      throw new ForbiddenException({
        message: 'ERR_ITEM_IS_INGREDIENT',
        details: itemsInRecipes, // Se envía como ['Harina', 'Sal']
      })
    }

    // 4. TRANSACCIÓN DE BORRADO (Si llegó aquí, no hay ingredientes)
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      for (const id of ids) {
        const item = await queryRunner.manager.findOne(Item, {
          where: { id, userId },
        })

        if (!item) throw new NotFoundException('ERR_ITEM_NOT_FOUND')

        // Soft Delete
        await queryRunner.manager.softRemove(item)
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

  /**
   * Actualiza múltiples ítems validando que el usuario sea PRO.
   */
  async updateBulk(
    userId: string,
    accessLevel: AccessLevel,
    inputs: BulkUpdateItemInput[],
  ): Promise<Item[]> {
    // 1. Validaciones globales (Usando Enums)
    if (accessLevel !== AccessLevel.PRO) {
      throw new ForbiddenException(ItemErrorCode.PRO_FEATURE_ONLY)
    }

    if (inputs.length > this.BATCH_LIMIT_PRO) {
      throw new ForbiddenException(ItemErrorCode.BULK_LIMIT_EXCEEDED)
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()

    const errorDetails: string[] = [] // Formato: "Nombre:CodigoEnum"
    const updatedIds: string[] = []

    for (const input of inputs) {
      // 🚩 LIMPIEZA INICIAL: Trim a los strings antes de cualquier lógica
      if (input.name) input.name = input.name.trim()
      if (input.sku) input.sku = input.sku.trim()
      if (input.barcode) input.barcode = input.barcode.trim()

      await queryRunner.startTransaction()
      try {
        const item = await queryRunner.manager.findOne(Item, {
          where: { id: input.id, userId },
        })

        if (!item) {
          errorDetails.push(
            `${input.name || input.id}:${ItemErrorCode.ITEM_NOT_FOUND}`,
          )
          await queryRunner.rollbackTransaction()
          continue
        }

        // --- VALIDACIONES DE NEGOCIO ---

        // 1. Validar Nombre (Ya tiene el trim hecho arriba)
        if (input.name !== undefined && input.name.length === 0) {
          errorDetails.push(`${item.name}:${ItemErrorCode.NAME_EMPTY}`)
          await queryRunner.rollbackTransaction()
          continue
        }

        // Recalcular roles (Profit, etc) si el precio de venta cambió
        if (input.salePrice !== undefined) {
          const newRoles = this.calculateItemRoles(
            item.costPrice,
            input.salePrice,
            item,
          )
          Object.assign(item, newRoles)
        }

        // 🚩 Object.assign ahora usará los valores con TRIM
        Object.assign(item, input)
        await queryRunner.manager.save(item)

        await queryRunner.commitTransaction()
        updatedIds.push(item.id)
      } catch (err: any) {
        await queryRunner.rollbackTransaction()

        let errorCode: ItemErrorCode = ItemErrorCode.INTERNAL_ERROR
        if (err.code === '23505') {
          const detail = err.detail?.toLowerCase() || ''
          if (detail.includes('sku')) errorCode = ItemErrorCode.DUPLICATE_SKU
          else if (detail.includes('barcode'))
            errorCode = ItemErrorCode.DUPLICATE_BARCODE
          else errorCode = ItemErrorCode.DUPLICATE_ENTRY
        }

        errorDetails.push(`${input.name || input.id}:${errorCode}`)
      }
    }
    await queryRunner.release()

    // 2. Si hubo errores en el proceso parcial, lanzamos la excepción para el GqlExceptionFilter
    if (errorDetails.length > 0) {
      throw new ForbiddenException({
        message: ItemErrorCode.BULK_PARTIAL_SUCCESS, // Usamos el Enum
        details: errorDetails,
      })
    }

    // 3. Éxito total
    return this.itemsRepository.find({
      where: { id: In(updatedIds), userId },
      order: { name: 'ASC' },
    })
  }

  /**
   * Busca múltiples ítems por sus IDs en una sola consulta.
   * Utilizado principalmente por el ItemsLoader (DataLoader).
   */
  async findBatchByIds(ids: string[], userId: string): Promise<Item[]> {
    // Usamos el operador In de TypeORM para buscar todos los IDs de una vez
    return await this.itemsRepository.find({
      where: {
        id: In(ids),
        userId: userId,
      },
    })
  }

  /**
   * Cambiar factor y unidad de producto o crear nuevo item.
   */
  async changeItemStructure(
    userId: string,
    input: UpdateItemInput,
  ): Promise<Item> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const oldItem = await queryRunner.manager.findOne(Item, {
        where: { id: input.id, userId },
      })

      if (!oldItem) throw new NotFoundException(ItemErrorCode.ITEM_NOT_FOUND)

      const hasHistory =
        await this.inventoryTransactionsService.hasOperationalHistory(
          userId,
          oldItem.id,
        )

      if (!hasHistory) {
        const updated = await this.update(userId, input)
        await queryRunner.commitTransaction()
        return updated
      }

      const timestamp = Date.now()
      const originalSku = oldItem.sku
      const originalBarcode = oldItem.barcode

      // Liberamos códigos únicos
      await queryRunner.manager.update(Item, oldItem.id, {
        sku: originalSku ? `${originalSku}_old_${timestamp}` : null,
        barcode: originalBarcode ? `${originalBarcode}_old_${timestamp}` : null,
      })

      await queryRunner.manager.softRemove(oldItem)

      const newItemData = { ...oldItem, ...input }

      delete (newItemData as Partial<Item>).id
      delete (newItemData as Partial<Item>).stock
      delete (newItemData as Partial<Item>).createdAt
      delete (newItemData as Partial<Item>).updatedAt
      delete (newItemData as Partial<Item>).deletedAt // Importante borrar este también

      newItemData.sku = originalSku
      newItemData.barcode = originalBarcode
      newItemData.stock = 0
      newItemData.userId = userId

      const newItem = queryRunner.manager.create(Item, newItemData)
      const savedItem = await queryRunner.manager.save(newItem)

      // 1. Mudanza si era ingrediente
      if (oldItem.isIngredient) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(RecipeIngredient)
          .set({ ingredientItemId: savedItem.id })
          .where('ingredientItemId = :oldId', { oldId: oldItem.id })
          .execute()
      }

      // 2. Mudanza si era el producto final de una receta
      if (oldItem.isProduced) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(Recipe)
          .set({ finalProductId: savedItem.id })
          .where('finalProductId = :oldId', { oldId: oldItem.id })
          .execute()
      }

      await queryRunner.commitTransaction()
      return savedItem
    } catch (err) {
      await queryRunner.rollbackTransaction()
      this.handleDuplicateError(err)
      throw err
    } finally {
      await queryRunner.release()
    }
  }
}
