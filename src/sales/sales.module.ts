// sales/sales.module.ts

import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SalesService } from './sales.service'
import { Sale } from './entities/sale.entity'
import { InventoryTransactionsModule } from '../inventory-transactions/inventory-transactions.module'
import { SalesResolver } from './sales.resolver'
import { SyncModule } from 'src/sync/sync.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale]),
    forwardRef(() => InventoryTransactionsModule),
    SyncModule,
  ],
  providers: [SalesResolver, SalesService],
})
export class SalesModule {}
