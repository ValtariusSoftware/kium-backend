// dashboard/dashboard.module.ts
import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DashboardService } from './dashboard.service'
import { DashboardResolver } from './dashboard.resolver'
import { Sale } from '../sales/entities/sale.entity'
import { InventoryTransaction } from '../inventory-transactions/entities/inventory-transaction.entity'
import { Item } from '../items/entities/item.entity'
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, InventoryTransaction, Item]),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [DashboardService, DashboardResolver],
  exports: [DashboardService],
})
export class DashboardModule {}
