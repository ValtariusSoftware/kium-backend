import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { ItemsService } from './items.service'
import { Item } from './entities/item.entity'
import { CreateItemInput } from './dto/create-item.dto'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { ProduceItemInput } from './dto/produce-item.dto'

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
  async findAll(@CurrentUser() user: User): Promise<Item[]> {
    return this.itemsService.findAll(user.id)
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
}
