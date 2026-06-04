// src/users/users.module.ts

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { UsersService } from './users.service'
import { UsersResolver } from './users.resolver'
import { FirebaseModule } from 'src/firebase/firebase.module'
@Module({
  // Importamos la Entidad para que TypeORM sepa cómo manejar la tabla
  imports: [
    TypeOrmModule.forFeature([User]),
    FirebaseModule, // 👈 AGREGA ESTO AQUÍ
  ],
  providers: [UsersService, UsersResolver],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
