import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Item } from './entities/item.entity'
import { ItemsService } from './items.service'
import { ItemsResolver } from './items.resolver'
import { RecipesModule } from 'src/recipes/recipes.module'
import { InventoryTransactionsModule } from 'src/inventory-transactions/inventory-transactions.module'
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Item]),
    forwardRef(() => RecipesModule),
    forwardRef(() => InventoryTransactionsModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [ItemsService, ItemsResolver],
  exports: [ItemsService],
})
export class ItemsModule {}
