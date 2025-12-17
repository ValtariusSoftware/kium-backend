import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Item } from './entities/item.entity'
import { ItemsService } from './items.service'
import { ItemsResolver } from './items.resolver'
import { RecipesModule } from 'src/recipes/recipes.module'
import { InventoryTransactionsModule } from 'src/inventory-transactions/inventory-transactions.module'

@Module({
  imports: [
    // Registramos la entidad Item en el módulo TypeORM
    TypeOrmModule.forFeature([Item]),
    // Usamos forwardRef aquí porque RecipesModule necesita ItemsModule
    // y ahora ItemsModule también necesita RecipesModule.
    forwardRef(() => RecipesModule), // <-- Solución al ciclo
    forwardRef(() => InventoryTransactionsModule),
    // InventoryTransactionsModule,
  ],
  providers: [ItemsService, ItemsResolver],
  // Exportamos el servicio si otros módulos (ej. Recetas, Auth) necesitan interactuar con Items
  exports: [ItemsService],
})
export class ItemsModule {}
