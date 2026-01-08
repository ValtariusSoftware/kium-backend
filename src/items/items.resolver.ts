import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveField,
  Float,
  Parent,
  ID,
  Context,
} from '@nestjs/graphql'
import { ItemsService } from './items.service'
import { Item } from './entities/item.entity'
import { BulkItemResponse, CreateItemInput } from './dto/create-item.dto'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { ProduceItemInput } from './dto/produce-item.dto'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { ItemsFilterInput } from './dto/items-filter.input'
import { BulkUpdateItemInput, UpdateItemInput } from './dto/update-item.input'
import { PaginatedItems } from './types/paginated-items.type'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { RecipesLoader } from 'src/recipes/recipes.loader'
import { BatchSimulationResponse } from './dto/simulate-production.output'
import { Recipe } from 'src/recipes/entities/recipe.entity'
import { RecipesService } from 'src/recipes/recipes.service'

@Resolver(() => Item)
export class ItemsResolver {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly recipesService: RecipesService,
  ) {}

  @Mutation(() => Item)
  async createItem(
    @Args('createItemInput') createItemInput: CreateItemInput,
    @CurrentUser() user: User, // Decora para obtener el objeto User (con ID y accessLevel)
  ): Promise<Item> {
    // El Service se encarga de aplicar el límite FREE/PRO
    return this.itemsService.create(user.id, user.accessLevel, createItemInput)
  }

  @Query(() => PaginatedItems, { name: 'items' }) // <--- Ahora devuelve la "caja"
  async getItems(
    @CurrentUser() user: User,
    @Args('filters', { nullable: true }) filters?: ItemsFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput, // Tu DTO
  ): Promise<PaginatedItems> {
    return this.itemsService.getItems(user.id, filters, pagination)
  }

  @Mutation(() => Item, {
    description: 'Ejecuta una producción, ajustando stock.',
  })
  async produceItem(
    @Args('produceItemInput') produceItemInput: ProduceItemInput,
    @CurrentUser() user: User,
  ): Promise<Item> {
    return this.itemsService.produce(user.id, produceItemInput)
  }

  @Mutation(() => Item, { name: 'adjustItemStock' })
  async adjustStock(
    @Args('adjustStockInput') adjustStockInput: AdjustStockInput,
    @CurrentUser() user: User,
  ): Promise<Item> {
    return this.itemsService.adjustStock(user.id, adjustStockInput)
  }

  @Query(() => PaginatedItems, { name: 'lowStockReport' })
  async getLowStockReport(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedItems> {
    return this.itemsService.getLowStockItems(user.id, pagination)
  }

  @ResolveField(() => Recipe, { nullable: true })
  async recipe(
    @Parent() item: Item,
    // 2. Usamos el Loader para ser ultra eficientes en listas largas
    @Context('recipesLoader') recipesLoader: RecipesLoader,
  ): Promise<Recipe | null> {
    if (!item.isProduced) return null

    // El loader ya busca por finalProductId internamente
    return recipesLoader.load(item.id)
  }

  @ResolveField(() => Float)
  async canProduceQuantity(
    @Parent() item: Item,
    @Context('recipesLoader') recipesLoader: RecipesLoader, // Usa el tipo real aquí
  ): Promise<number> {
    if (!item.isProduced) return 0

    // Ahora recipe será Recipe | null
    const recipe = await recipesLoader.load(item.id)
    if (!recipe) return 0

    return this.itemsService.runVirtualStockMath(recipe)
  }

  @ResolveField(() => Float)
  async totalAvailableStock(
    @Parent() item: Item,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Context('recipesLoader') recipesLoader: any,
  ): Promise<number> {
    let virtual = 0

    if (item.isProduced) {
      const recipe = await recipesLoader.load(item.id)
      if (recipe) {
        virtual = this.itemsService.runVirtualStockMath(recipe)
      }
    }

    return Number(item.stock) + virtual
  }

  @Mutation(() => [Item], { name: 'produceItemsBatch' })
  async produceItemsBatch(
    @Args({ name: 'inputs', type: () => [ProduceItemInput] })
    inputs: ProduceItemInput[],
    @CurrentUser() user: User,
  ): Promise<Item[]> {
    return this.itemsService.produceItemsBatch(user.id, inputs)
  }

  @Query(() => BatchSimulationResponse, { name: 'simulateProductionBatch' })
  async simulateProductionBatch(
    @Args({ name: 'inputs', type: () => [ProduceItemInput] })
    inputs: ProduceItemInput[],
    @CurrentUser() user: User,
  ): Promise<BatchSimulationResponse> {
    return this.itemsService.simulateBatch(user.id, inputs)
  }

  // Buscar un producto por código de barras (Rápido para el escáner)
  @Query(() => Item, { name: 'getItemByBarcode', nullable: true })
  async getByBarcode(
    @Args('barcode') barcode: string,
    @CurrentUser() user: User,
  ): Promise<Item | null> {
    return this.itemsService.findByBarcode(user.id, barcode)
  }

  @Mutation(() => Item)
  async updateItem(
    @Args('updateItemInput') updateItemInput: UpdateItemInput,
    @CurrentUser() user: User,
  ): Promise<Item> {
    return this.itemsService.update(user.id, updateItemInput)
  }

  @Mutation(() => BulkItemResponse, { name: 'createItemsBulk' }) // <--- Cambio aquí
  async createItemsBulk(
    @Args('inputs', { type: () => [CreateItemInput] })
    inputs: CreateItemInput[],
    @CurrentUser() user: User,
  ): Promise<BulkItemResponse> {
    // <--- Y aquí
    return this.itemsService.createBulk(user.id, user.accessLevel, inputs)
  }

  @Mutation(() => Boolean, {
    name: 'removeItem',
    description: 'Realiza un borrado lógico de un ítem',
  })
  async removeItem(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User, // Tu decorador de usuario autenticado
  ): Promise<boolean> {
    return this.itemsService.remove(id, user.id)
  }

  // Mutación para Borrado Masivo
  @Mutation(() => Boolean, { name: 'removeItemsBulk' })
  async removeItemsBulk(
    @Args('ids', { type: () => [ID] }) ids: string[],
    @CurrentUser() user: User,
  ): Promise<boolean> {
    return this.itemsService.removeBulk(user.id, user.accessLevel, ids)
  }

  // Mutación para Actualización Masiva
  @Mutation(() => [Item], { name: 'updateItemsBulk' })
  async updateItemsBulk(
    @Args('inputs', { type: () => [BulkUpdateItemInput] })
    inputs: BulkUpdateItemInput[],
    @CurrentUser() user: User,
  ): Promise<Item[]> {
    return this.itemsService.updateBulk(user.id, user.accessLevel, inputs)
  }
}
