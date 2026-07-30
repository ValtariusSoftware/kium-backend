// src/sync/sync.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SyncGateway } from './sync.gateway'
import { SyncEventEntity } from './entities/sync-event.entity'
import { SyncService } from './sync.service'
import { SyncResolver } from './sync.resolver'
import { UsersModule } from 'src/users/users.module'
import { AuthModule } from 'src/auth/auth.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncEventEntity]), // Registramos la entidad para que TypeORM cree la tabla
    UsersModule,
    AuthModule,
  ],
  providers: [SyncGateway, SyncService, SyncResolver],
  exports: [
    SyncGateway,
    SyncService, // Exportamos el service por si otros módulos necesitan inyectarlo para registrar eventos
  ],
})
export class SyncModule {}
