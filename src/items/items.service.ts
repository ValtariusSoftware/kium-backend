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
import { CreateItemInput } from './dto/create-item.dto'
import { RecipesService } from 'src/recipes/recipes.service'
import { ProduceItemInput } from './dto/produce-item.dto'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { GraphQLError } from 'graphql'
import { ItemsFilterInput, StockStatusFilter } from './dto/items-filter.input'
import { UpdateItemInput } from './dto/update-item.input'

@Injectable()
export class ItemsService {
  private readonly ITEM_LIMIT_FREE = 25
  private readonly BATCH_LIMIT_FREE = 10 // Límite para operaciones masivas (opcional)
  // ITEM_LIMIT_PRO_RECIPES = X; // Límite que se podría usar para recetas

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
      // 1. Validar Límite
      const itemCount = await queryRunner.manager.count(Item, {
        where: { userId },
      })

      if (
        accessLevel === AccessLevel.FREE &&
        itemCount >= this.ITEM_LIMIT_FREE
      ) {
        throw new ForbiddenException(
          `Límite alcanzado. Como usuario FREE puedes tener hasta ${this.ITEM_LIMIT_FREE} ítems.`,
        )
      }

      // 2. INFERENCIA DE ROLES (Lógica Corregida)
      // Es Vendible si tiene precio de venta mayor a 0
      const isSaleable =
        !!createItemInput.salePrice && createItemInput.salePrice > 0

      // Lógica inteligente para isPurchasable:
      let isPurchasable = false
      if (createItemInput.costPrice && createItemInput.costPrice > 0) {
        // Si el usuario pone un costo, es algo que compra a un proveedor
        isPurchasable = true
      } else if (!isSaleable) {
        // Si no se vende y no tiene costo (ej. un insumo nuevo),
        // lo dejamos en true para que pueda cargarse en compras.
        isPurchasable = true
      }
      // NOTA: Si isSaleable es true (Pizza) y costPrice es 0, isPurchasable queda en FALSE.

      const initialStock = createItemInput.stock || 0.0

      const itemDataToCreate = {
        ...createItemInput,
        stock: 0.0, // Stock inicial siempre 0 para auditar vía movimiento
        userId,
        isSaleable,
        isPurchasable,
        isProduced: false, // Se activará cuando se cree una Receta
        isIngredient: false, // Se activará cuando se use como insumo de otro
      }

      // 3. Creación de la Ficha
      const newItem = queryRunner.manager.create(Item, itemDataToCreate)
      const savedItem = await queryRunner.manager.save(newItem)

      // 4. Registrar Movimiento Inicial si aplica
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

      if (!itemWithFinalStock) {
        throw new NotFoundException('Error fatal: El ítem no se encontró.')
      }

      return itemWithFinalStock
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Obtiene la lista de ítems filtrada según los roles (flags) y estados de stock.
   */
  async getItems(userId: string, filters?: ItemsFilterInput): Promise<Item[]> {
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

    query.orderBy('item.name', 'ASC')
    return query.getMany()
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

      // --- 🛡️ 1. PASO DE VALIDACIÓN PREVIA (STOCK COMPLETO) ---
      const missingIngredients: string[] = []

      for (const ingredient of recipe.ingredients) {
        const baseQtyToConsume = ingredient.quantityRequired * factor
        const stockQtyToConsume =
          baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty

        const currentStock = Number(ingredient.ingredientItem.stock)

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

        // Registrar movimiento de salida (CONSUMPTION)
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

      // Usamos el costo actual de la ficha maestra (el que seteaste en 1950)
      // para el registro de la transacción, en lugar de recalcularlo erróneamente aquí.
      const currentFinalProductCost = Number(recipe.finalProduct.costPrice || 0)

      // Registrar movimiento de entrada (PRODUCTION_IN)
      // Nota: Ya NO hacemos queryRunner.manager.update(Item, ...) aquí.
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

      const updatedItem = await this.itemsRepository.findOne({
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
  async getLowStockItems(userId: string): Promise<Item[]> {
    return this.itemsRepository
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .andWhere('item.minStockAlert IS NOT NULL')
      .andWhere('item.stock <= item.minStockAlert')
      .orderBy('item.stock', 'ASC') // Priorizar los que tienen menos
      .getMany()
  }

  /**
   * Calcula cuánto se puede producir de un ítem basado en sus insumos actuales.
   * Devuelve el stock "virtual" adicional que podría fabricarse.
   */
  async calculateVirtualStock(userId: string, item: Item): Promise<number> {
    // 1. Si el ítem no tiene el flag de producción activado, no calculamos nada.
    // Esto reemplaza al viejo item.type !== ItemType.FINAL_PRODUCT
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
      const stockAvailable = Number(ingredient.ingredientItem.stock)

      // Cantidad de ingrediente necesaria para 1 unidad de producto final
      const qtyNeededPerUnit =
        ingredient.quantityRequired /
        recipe.yieldQuantity /
        ingredient.ingredientItem.conversionToBaseQty

      if (qtyNeededPerUnit > 0) {
        // ¿Cuántas unidades finales puedo hacer con este ingrediente?
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

    // 1. Inferencia de Vendible
    if (updateData.salePrice !== undefined) {
      item.isSaleable = !!updateData.salePrice && updateData.salePrice > 0
    }

    // 2. Inferencia de Comprable (Lógica mejorada)
    if (updateData.costPrice !== undefined) {
      if (item.isProduced) {
        // Si el producto tiene receta activa, forzamos isPurchasable en false
        // independientemente de lo que envíen en costPrice,
        // porque el costo lo manda la receta.
        item.isPurchasable = false
      } else {
        // Si NO tiene receta, se vuelve comprable si tiene un costo mayor a 0
        item.isPurchasable = updateData.costPrice > 0
      }
    }

    // 3. Fusionar cambios
    Object.assign(item, updateData)

    try {
      return await this.itemsRepository.save(item)
    } catch (error) {
      if (error.code === '23505') {
        const detail = error.detail || ''
        if (detail.includes('barcode')) {
          throw new GraphQLError(
            'El código de barras ya está asignado a otro producto.',
          )
        }
        if (detail.includes('sku')) {
          throw new GraphQLError('El SKU ya está asignado a otro producto.')
        }
      }
      throw error
    }
  }
}
