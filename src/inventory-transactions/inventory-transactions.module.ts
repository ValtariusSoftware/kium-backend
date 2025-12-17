import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InventoryTransactionsService } from './inventory-transactions.service'
import { InventoryTransactionsResolver } from './inventory-transactions.resolver'
import { InventoryTransaction } from './entities/inventory-transaction.entity'
import { Item } from '../items/entities/item.entity' // Asegúrate de que Items esté disponible si es un módulo independiente
import { ItemsModule } from 'src/items/items.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryTransaction, Item]), // Asegúrate de registrar Item si no está en otro módulo
    forwardRef(() => ItemsModule),
  ],
  providers: [InventoryTransactionsService, InventoryTransactionsResolver],
  exports: [
    InventoryTransactionsService, // Exportamos el servicio para que ItemsService pueda usarlo
  ],
})
export class InventoryTransactionsModule {}
