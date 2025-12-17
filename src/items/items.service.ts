import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { Item } from './entities/item.entity'
import { AccessLevel } from '../users/entities/user.entity' // Asumiendo que esta es la ruta correcta
import { CreateItemInput } from './dto/create-item.dto'
import { RecipesService } from 'src/recipes/recipes.service'
import { ProduceItemInput } from './dto/produce-item.dto'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import { TransactionType } from 'src/inventory-transactions/enums/transaction-type.enum'

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
   * Obtiene todos los ítems de un usuario (para la query de inventario total).
   * @param userId El ID del usuario.
   * @returns Lista de ítems.
   */
  async findAll(userId: string): Promise<Item[]> {
    return this.itemsRepository.find({ where: { userId } })
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
  async produce(userId: string, input: ProduceItemInput): Promise<Item> {
    const queryRunner = this.dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // 1. Obtener la Receta (y verificar propiedad)
      const recipe = await this.recipesService.findOne(input.recipeId, userId)
      if (!recipe) {
        throw new NotFoundException(
          'Receta no encontrada o no pertenece al usuario.',
        )
      }

      // 2. Calcular el factor de producción real
      const factor = input.quantityToProduce / recipe.yieldQuantity

      // 3. Procesar Ingredientes (DECREMENTAR STOCK)
      for (const ingredient of recipe.ingredients) {
        // Cantidad real a consumir (ej: 0.5kg * factor)
        const quantityToConsume = ingredient.quantityRequired * factor

        // Utilizamos el query runner para la actualización dentro de la transacción
        const updateResult = await queryRunner.manager.increment(
          Item,
          { id: ingredient.ingredientItemId, userId }, // WHERE
          'stock', // Columna
          -quantityToConsume / ingredient.ingredientItem.conversionToBaseQty, // Valor (negativo para decrementar)
          // ⚠️ NOTA: El decremento debe hacerse en la unidad de stock del item, NO en la unidad base.
          // El factor de conversión lo usamos para asegurar que el descuento sea preciso.
        )

        if (updateResult.affected === 0) {
          // Esto puede significar que el stock es insuficiente (si tienes un CHECK constraint) o el ítem no existe.
          // Aquí se pueden añadir validaciones de stock insuficientes (Paso 3, query de validación).
          throw new ForbiddenException(
            `Stock insuficiente para el ingrediente: ${ingredient.ingredientItem.name}`,
          )
        }
      }

      // 4. Procesar Producto Final (INCREMENTAR STOCK)
      const quantityToProduce =
        input.quantityToProduce / recipe.finalProduct.conversionToBaseQty

      const updatedFinalProductResult = await queryRunner.manager.increment(
        Item,
        { id: recipe.finalProductId, userId }, // WHERE
        'stock',
        quantityToProduce, // Valor positivo
      )

      if (updatedFinalProductResult.affected === 0) {
        throw new NotFoundException('Producto final no encontrado.')
      }

      // 5. Commit de la Transacción
      await queryRunner.commitTransaction()

      // 6. Devolver el ítem actualizado
      const updatedItem = await this.itemsRepository.findOne({
        where: { id: recipe.finalProductId },
      })

      if (!updatedItem) {
        // Si llegamos aquí, algo está terriblemente mal en la DB/TypeORM,
        // pero manejamos el caso 'null'.
        throw new NotFoundException(
          'Error fatal: El producto final no se encontró tras la producción.',
        )
      }

      return updatedItem // <-- Ahora devuelve un Item no nulo
    } catch (err) {
      // Si algo falla, hacer ROLLBACK
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      // Siempre liberar el query runner
      await queryRunner.release()
    }
  }
}
