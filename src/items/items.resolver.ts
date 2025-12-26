import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveField,
  Float,
  Parent,
} from '@nestjs/graphql'
import { ItemsService } from './items.service'
import { Item } from './entities/item.entity'
import { CreateItemInput } from './dto/create-item.dto'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { ProduceItemInput } from './dto/produce-item.dto'
import { AdjustStockInput } from './dto/adjust-stock.input'
import { ItemsFilterInput } from './dto/items-filter.input'

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
    // 💡 NOTA: Idealmente, esta lógica debería estar en RecipesResolver,
    // pero la colocamos aquí temporalmente para simplificar la estructura.
    // Necesitas implementar el método 'produce' en el service.
    // Asumimos que devuelve el ítem (Producto Final) actualizado.
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
}
