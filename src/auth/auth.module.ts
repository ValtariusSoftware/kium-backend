// src/auth/auth.module.ts

import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module' // Necesitamos el UsersModule para usar UsersService
import { AuthResolver } from './auth.resolver'
import { AuthService } from './auth.service'
import { FirebaseModule } from 'src/firebase/firebase.module'

@Module({
  imports: [UsersModule, FirebaseModule],
  providers: [AuthResolver, AuthService],
  exports: [AuthService], // Exportamos si otros módulos necesitan usarlo
})
export class AuthModule {}
