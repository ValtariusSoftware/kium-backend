// src/users/users.module.ts

import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { Item } from 'src/items/entities/item.entity'
import { UsersService } from './users.service'
import { UsersResolver } from './users.resolver'
import { FirebaseModule } from 'src/firebase/firebase.module'
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module'
import { SyncEventEntity } from 'src/sync/entities/sync-event.entity'

@Module({
  // Importamos la Entidad para que TypeORM sepa cómo manejar la tabla
  imports: [
    TypeOrmModule.forFeature([User, Item, SyncEventEntity]),
    FirebaseModule, // 👈 AGREGA ESTO AQUÍ
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [UsersService, UsersResolver],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
