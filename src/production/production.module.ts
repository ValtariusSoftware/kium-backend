import { Module, forwardRef } from '@nestjs/common'
import { ProductionService } from './production.service'
import { ProductionResolver } from './production.resolver'
import { ItemsModule } from '../items/items.module'
import { RecipesModule } from '../recipes/recipes.module'
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module'

@Module({
  imports: [
    // Importamos los módulos que el servicio de producción necesita consultar o afectar
    forwardRef(() => ItemsModule),
    forwardRef(() => RecipesModule),
    forwardRef(() => InventoryTransactionsModule),
  ],
  providers: [ProductionService, ProductionResolver],
  exports: [ProductionService],
})
export class ProductionModule {}
