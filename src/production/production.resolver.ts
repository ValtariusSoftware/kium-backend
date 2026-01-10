import {
  Resolver,
  Mutation,
  Query,
  Args,
  // ResolveField,
  // Parent,
  // Context,
  // Float,
} from '@nestjs/graphql'
import { ProductionService } from './production.service'
import { Item } from '../items/entities/item.entity'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { ProduceItemInput } from './dto/produce-item.dto'
import { BatchSimulationResponse } from './dto/simulate-production.output'
// import { RecipesLoader } from 'src/recipes/recipes.loader'

@Resolver()
export class ProductionResolver {
  constructor(private readonly productionService: ProductionService) {}

  @Mutation(() => Item, {
    name: 'produceItem',
    description:
      'Ejecuta una producción, ajustando stock de ingredientes y producto final.',
  })
  async produceItem(
    @Args('produceItemInput') produceItemInput: ProduceItemInput,
    @CurrentUser() user: User,
  ): Promise<Item> {
    return this.productionService.produce(user.id, produceItemInput)
  }

  @Mutation(() => [Item], {
    name: 'produceItemsBatch',
    description: 'Produce múltiples recetas en una sola transacción atómica.',
  })
  async produceItemsBatch(
    @Args({ name: 'inputs', type: () => [ProduceItemInput] })
    inputs: ProduceItemInput[],
    @CurrentUser() user: User,
  ): Promise<Item[]> {
    return this.productionService.produceItemsBatch(user.id, inputs)
  }

  // @ResolveField(() => Float)
  // async canProduceQuantity(
  //   @Parent() item: Item,
  //   @Context('recipesLoader') recipesLoader: RecipesLoader,
  // ): Promise<number> {
  //   if (!item.isProduced) return 0

  //   const recipe = await recipesLoader.load(item.id)
  //   if (!recipe) return 0

  //   // CAMBIO AQUÍ: Ahora lo pides al ProductionService
  //   return this.productionService.runVirtualStockMath(recipe)
  // }

  // @ResolveField(() => Float)
  // async totalAvailableStock(
  //   @Parent() item: Item,
  //   @Context('recipesLoader') recipesLoader: RecipesLoader,
  // ): Promise<number> {
  //   let virtual = 0

  //   if (item.isProduced) {
  //     const recipe = await recipesLoader.load(item.id)
  //     if (recipe) {
  //       // CAMBIO AQUÍ: Ahora lo pides al ProductionService
  //       virtual = this.productionService.runVirtualStockMath(recipe)
  //     }
  //   }

  //   return Number(item.stock) + virtual
  // }

  @Query(() => BatchSimulationResponse, {
    name: 'simulateProductionBatch',
    description: 'Simula el consumo de ingredientes sin afectar el stock real.',
  })
  async simulateProductionBatch(
    @Args({ name: 'inputs', type: () => [ProduceItemInput] })
    inputs: ProduceItemInput[],
    @CurrentUser() user: User,
  ): Promise<BatchSimulationResponse> {
    return this.productionService.simulateBatch(user.id, inputs)
  }
}
