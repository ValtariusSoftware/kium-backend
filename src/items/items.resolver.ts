import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveField,
  Float,
  Parent,
  ID,
} from '@nestjs/graphql'
import { ItemsService } from './items.service'
import { Item } from './entities/item.entity'
import { BulkItemResponse, CreateItemInput } from './dto/create-item.dto'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { ProduceItemInput } from './dto/produce-item.dto'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { ItemsFilterInput } from './dto/items-filter.input'
import { UpdateItemInput } from './dto/update-item.input'

@Resolver(() => Item)
export class ItemsResolver {
  constructor(private readonly itemsService: ItemsService) {}

  @Mutation(() => Item)
  async createItem(
    @Args('createItemInput') createItemInput: CreateItemInput,
    @CurrentUser() user: User, // Decora para obtener el objeto User (con ID y accessLevel)
  ): Promise<Item> {
    // El Service se encarga de aplicar el límite FREE/PRO
    return this.itemsService.create(user.id, user.accessLevel, createItemInput)
  }

  @Query(() => [Item], { name: 'items' })
  async getItems(
    @CurrentUser() user: User,
    // Agregamos los filtros como argumento opcional
    @Args('filters', { nullable: true }) filters?: ItemsFilterInput,
  ): Promise<Item[]> {
    // Ahora el service recibe el userId y el objeto de filtros completo
    return this.itemsService.getItems(user.id, filters)
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

  @Query(() => [Item], { name: 'lowStockReport' })
  async getLowStockReport(@CurrentUser() user: User): Promise<Item[]> {
    return this.itemsService.getLowStockItems(user.id)
  }

  @ResolveField(() => Float, {
    description:
      'Cantidad extra que se puede fabricar con los insumos actuales.',
  })
  async canProduceQuantity(@Parent() item: Item): Promise<number> {
    return this.itemsService.calculateVirtualStock(item.userId, item)
  }

  @ResolveField(() => Float, {
    description: 'Suma del stock físico actual más lo que se puede producir.',
  })
  async totalAvailableStock(@Parent() item: Item): Promise<number> {
    const virtual = await this.itemsService.calculateVirtualStock(
      item.userId,
      item,
    )
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
}
