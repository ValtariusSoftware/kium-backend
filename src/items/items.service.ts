import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
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
      throw new NotFoundException(`Ítem con ID ${id} no encontrado.`)
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
    if (accessLevel !== AccessLevel.PRO) {
      throw new ForbiddenException(
        'La actualización masiva es exclusiva para usuarios PRO.',
      )
    }

    if (inputs.length > this.BATCH_LIMIT_PRO) {
      throw new ForbiddenException(
        `Límite excedido: máx ${this.BATCH_LIMIT_PRO} ítems.`,
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      for (const input of inputs) {
        const { id, ...updateData } = input

        const item = await queryRunner.manager.findOne(Item, {
          where: { id, userId },
        })

        if (!item) throw new Error(`El ítem con ID "${id}" no existe.`)

        // Si cambia el precio de venta, recalculamos roles
        if (updateData.salePrice !== undefined) {
          const newRoles = this.calculateItemRoles(
            item.costPrice,
            updateData.salePrice,
            item,
          )
          Object.assign(item, newRoles)
        }

        Object.assign(item, updateData)
        await queryRunner.manager.save(item)
      }

      await queryRunner.commitTransaction()

      return this.itemsRepository.find({
        where: { id: In(inputs.map((i) => i.id)), userId },
        order: { name: 'ASC' },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await queryRunner.rollbackTransaction()
      // ... tu lógica de manejo de errores amigables se mantiene igual
      throw new ForbiddenException({
        message: 'La actualización masiva falló.',
        detail: err.message,
      })
    } finally {
      await queryRunner.release()
    }
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
}
