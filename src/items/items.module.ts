import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Item } from './entities/item.entity'
import { ItemsService } from './items.service'
import { ItemsResolver } from './items.resolver'
import { RecipesModule } from 'src/recipes/recipes.module'
import { InventoryTransactionsModule } from 'src/inventory-transactions/inventory-transactions.module'
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module'
import { ExcelParserService } from 'src/excel/excel-parser.service'
import { ExcelModule } from 'src/excel/excel.module'
import { ItemsDomainService } from './items-domain.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Item]),
    forwardRef(() => RecipesModule),
    forwardRef(() => InventoryTransactionsModule),
    forwardRef(() => SubscriptionsModule),
    ExcelModule,
  ],
  providers: [
    ItemsService,
    ItemsDomainService,
    ItemsResolver,
    ExcelParserService,
  ],
  exports: [ItemsService, ItemsDomainService],
})
export class ItemsModule {}
