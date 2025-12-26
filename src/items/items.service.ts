import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, QueryRunner, In } from 'typeorm'
import { Item, ItemType } from './entities/item.entity'
import { AccessLevel } from '../users/entities/user.entity' // Asumiendo que esta es la ruta correcta
import { CreateItemInput } from './dto/create-item.dto'
import { RecipesService } from 'src/recipes/recipes.service'
import { ProduceItemInput } from './dto/produce-item.dto'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { GraphQLError } from 'graphql'
import { ItemsFilterInput, StockStatusFilter } from './dto/items-filter.input'

@Injectable()
export class ItemsService {
  private readonly ITEM_LIMIT_FREE = 10
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
    await queryRunner.startTransaction() // 🔑 Transacción Atómica

    try {
      // 1. Obtener y Validar Límite
      // Usamos el manager del QueryRunner para asegurar que el count esté en la transacción
      const itemCount = await queryRunner.manager.count(Item, {
        where: { userId },
      })

      if (
        accessLevel === AccessLevel.FREE &&
        itemCount >= this.ITEM_LIMIT_FREE
      ) {
        throw new ForbiddenException(
          `El usuario FREE ha alcanzado el límite de ${this.ITEM_LIMIT_FREE} ítems.`,
        )
      }

      // Separamos el stock inicial del input (si existe)
      // Asumimos que createItemInput.stock es el valor que el usuario ingresó
      const initialStock = createItemInput.stock || 0.0
      const itemDataToCreate = {
        ...createItemInput,
        // STOCK INICIAL EN LA FICHA ES SIEMPRE 0.0 (AUDITORÍA)
        stock: 0.0,
        userId,
      }

      // 2. Creación del ítem (Ficha)
      const newItem = queryRunner.manager.create(Item, itemDataToCreate)
      const savedItem = await queryRunner.manager.save(newItem) // Item con stock 0.0

      // 3. Registrar el Movimiento de Stock Inicial si initialStock > 0
      if (initialStock > 0) {
        // Usamos el servicio de transacciones, ANIDADO en la transacción actual
        await this.inventoryTransactionsService.registerMovement(
          userId,
          {
            itemId: savedItem.id,
            type: TransactionType.INITIAL_INVENTORY,
            quantity: initialStock,
            // El costo en la creación inicial es desconocido,
            // pero si el DTO lo trae, lo usamos; si no, 0.
            unitCostSnapshot: createItemInput.costPrice || 0,
            documentRef: 'INITIAL',
            notes: 'Inventario inicial al crear el ítem.',
          },
          queryRunner, // 🔑 PASAMOS EL QUERY RUNNER para anidar la operación
        )

        // NOTA: El registerMovement se encarga de:
        // a) Insertar en InventoryTransaction
        // b) Actualizar (INCREMENTAR) el campo 'stock' en la tabla 'items'
      }

      // 4. Commit de la Transacción (Si la creación y el registro funcionaron)
      await queryRunner.commitTransaction()

      // 5. Devolver el ítem actualizado con el stock final
      const itemWithFinalStock = await this.itemsRepository.findOne({
        where: { id: savedItem.id },
      })

      if (!itemWithFinalStock) {
        // Fallo grave
        throw new NotFoundException(
          'Error fatal: El ítem no se encontró tras la creación atómica.',
        )
      }

      return itemWithFinalStock
    } catch (err) {
      // 6. Rollback si algo falla
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      // 7. Liberar el query runner
      await queryRunner.release()
    }
  }

  /**
   * Obtiene la lista de ítems filtrada según las necesidades del frontend.
   * Permite buscar por múltiples tipos (RESELL, FINAL, INGREDIENT) y estados de stock.
   */
  async getItems(userId: string, filters?: ItemsFilterInput): Promise<Item[]> {
    const query = this.itemsRepository
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })

    // 1. Filtrado por múltiples tipos
    if (filters?.types && filters.types.length > 0) {
      query.andWhere('item.type IN (:...types)', { types: filters.types })
    }

    // 2. Filtros de estado de stock
    if (filters?.stockStatus) {
      switch (filters.stockStatus) {
        case StockStatusFilter.OUT_OF_STOCK:
          // Productos que se agotaron completamente
          query.andWhere('item.stock <= 0')
          break

        case StockStatusFilter.LOW_STOCK:
          // CRÍTICO: Ahora incluye ítems con stock 0 si tienen alerta configurada.
          // Si minStockAlert es 5 y stock es 0, el Pan Francés aparecerá aquí.
          query
            .andWhere('item.minStockAlert IS NOT NULL')
            .andWhere('item.stock <= item.minStockAlert')
          break

        case StockStatusFilter.AVAILABLE:
          // Solo lo que tiene existencia física para entrega inmediata
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
      let totalProductionCost = 0

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

      // Si falta aunque sea un ingrediente, disparamos el error con la lista completa
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

      // --- 2. CÁLCULO DE COSTO Y CONSUMO ---
      // Si llegamos aquí, sabemos que hay stock suficiente de todo
      for (const ingredient of recipe.ingredients) {
        const baseQtyToConsume = ingredient.quantityRequired * factor
        const stockQtyToConsume =
          baseQtyToConsume / ingredient.ingredientItem.conversionToBaseQty

        const ingredientUnitCost = Number(
          ingredient.ingredientItem.costPrice || 0,
        )
        totalProductionCost += stockQtyToConsume * ingredientUnitCost

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

      const unitCostProduced =
        Math.round((totalProductionCost / stockQtyProduced) * 100) / 100

      // Actualizar precio de costo en la ficha maestra
      await queryRunner.manager.update(
        Item,
        { id: recipe.finalProductId },
        { costPrice: unitCostProduced },
      )

      // Registrar movimiento de entrada (PRODUCTION_IN)
      await this.inventoryTransactionsService.registerMovement(
        userId,
        {
          itemId: recipe.finalProductId,
          type: TransactionType.PRODUCTION_IN,
          quantity: stockQtyProduced,
          unitCostSnapshot: unitCostProduced,
          documentRef: `PROD-RECIPE-${recipe.id}`,
          notes: `Producción finalizada. Costo total de insumos: ${totalProductionCost.toFixed(2)}`,
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
    // 1. Si no es un producto final, no se produce nada extra
    if (item.type !== ItemType.FINAL_PRODUCT) return 0

    // 2. Buscamos la receta (usando el método silencioso que no tira error)
    const recipe = await this.recipesService.findByFinalProductId(
      item.id,
      userId,
    )

    // 3. Si no tiene receta o no tiene ingredientes, no se puede producir virtualmente
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0)
      return 0

    let minPossible = Infinity

    for (const ingredient of recipe.ingredients) {
      const stockAvailable = Number(ingredient.ingredientItem.stock)

      // Cantidad de ingrediente necesaria para 1 unidad de producto final
      // Fórmula: (Cantidad requerida en receta / Rendimiento de receta) / Conversión de medida del ingrediente
      const qtyNeededPerUnit =
        ingredient.quantityRequired /
        recipe.yieldQuantity /
        ingredient.ingredientItem.conversionToBaseQty

      if (qtyNeededPerUnit > 0) {
        // ¿Cuántas unidades finales puedo hacer con este ingrediente específico?
        const possibleWithThisIng = Math.floor(
          stockAvailable / qtyNeededPerUnit,
        )

        // El ingrediente con MENOR capacidad es nuestro cuello de botella
        if (possibleWithThisIng < minPossible) {
          minPossible = possibleWithThisIng
        }
      }
    }

    // Si minPossible sigue siendo Infinity, es porque no hubo cálculos válidos
    return minPossible === Infinity ? 0 : minPossible
  }

  /**
   * Produce múltiples recetas en una sola transacción.
   */
  async produceItemsBatch(
    userId: string,
    inputs: ProduceItemInput[],
  ): Promise<Item[]> {
    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()

    try {
      const itemIds: string[] = []

      for (const input of inputs) {
        // Ejecutamos la producción (esto descuenta insumos y suma al producto final)
        const updatedItem = await this.produce(userId, input, runner)

        // Guardamos los IDs para recargarlos al final
        if (!itemIds.includes(updatedItem.id)) {
          itemIds.push(updatedItem.id)
        }
      }

      // 🔑 PASO CLAVE 1: Hacemos el commit PRIMERO
      await runner.commitTransaction()

      // 🔑 PASO CLAVE 2: Recargamos los datos frescos de la DB después del commit
      // Esto garantiza que el stock devuelto sea el real actualizado
      return this.itemsRepository.find({
        where: { id: In(itemIds) }, // Necesitás importar { In } de 'typeorm'
        order: { name: 'ASC' },
      })
    } catch (err) {
      await runner.rollbackTransaction()
      throw err
    } finally {
      await runner.release()
    }
  }
}
