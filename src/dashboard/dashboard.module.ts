// dashboard/dashboard.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DashboardService } from './dashboard.service'
import { DashboardResolver } from './dashboard.resolver'
import { Sale } from '../sales/entities/sale.entity'
import { InventoryTransaction } from '../inventory-transactions/entities/inventory-transaction.entity'
import { Item } from '../items/entities/item.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Sale, InventoryTransaction, Item])],
  providers: [DashboardService, DashboardResolver],
})
export class DashboardModule {}
