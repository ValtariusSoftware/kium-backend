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
    description:
      'Produce múltiples recetas, retornando el listado de ítems exitosos.',
  })
  async produceItemsBatch(
    @Args({ name: 'inputs', type: () => [ProduceItemInput] })
    inputs: ProduceItemInput[],
    @CurrentUser() user: User,
  ): Promise<Item[]> {
    // Llamamos al servicio, que procesa todo y retorna BulkItemResponse
    const result = await this.productionService.produceItemsBatch(
      user.id,
      inputs,
    )

    // Retornamos solo el array de éxitos que el frontend espera
    return result.created
  }

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
