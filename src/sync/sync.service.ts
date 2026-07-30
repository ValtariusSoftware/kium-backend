import { Injectable } from '@nestjs/common'
import { SyncEventEntity } from './entities/sync-event.entity'
import { DataSource, MoreThan, QueryRunner, Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'

// src/sync/sync.service.ts
@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SyncEventEntity)
    private readonly syncEventRepo: Repository<SyncEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async registerEvent(
    userId: string,
    entityType: string,
    entityId: string,
    action: 'UPSERT' | 'DELETE',
    originClientId?: string | null,
    queryRunner?: QueryRunner, // 👈 Opcional
  ) {
    // Si nos pasan un queryRunner activo, usamos su manager para respetar la transacción
    const repo = queryRunner
      ? queryRunner.manager.getRepository(SyncEventEntity)
      : this.syncEventRepo

    // Buscamos el último sequenceNumber del usuario
    const lastEvent = await repo.findOne({
      where: { userId },
      order: { sequenceNumber: 'DESC' },
    })

    const nextSequence = lastEvent ? Number(lastEvent.sequenceNumber) + 1 : 1

    // Guardamos el nuevo evento de sincronización
    await repo.save({
      userId,
      sequenceNumber: nextSequence,
      entityType,
      entityId,
      action,
      originClientId: originClientId || null,
    })
  }

  // Método que responderá al celular cuando pregunte por cambios
  async getChangesSince(userId: string, lastSequence: number) {
    const events = await this.syncEventRepo.find({
      where: {
        userId,
        sequenceNumber: MoreThan(lastSequence),
      },
      order: { sequenceNumber: 'ASC' },
    })

    let requiresFullSync = false

    // Si el celular pide una secuencia muy vieja que ya no existe en los logs actuales,
    // o si pasaron demasiados eventos, forzamos un Full Sync.
    if (events.length === 0 && lastSequence > 0) {
      // Opcional: Podés chequear si existe algún evento en la tabla para este usuario.
      // Si la tabla tiene datos pero el lastSequence del celu está muy atrás, requiere full sync.
      const oldestEvent = await this.syncEventRepo.findOne({
        where: { userId },
        order: { sequenceNumber: 'ASC' },
      })

      if (oldestEvent && oldestEvent.sequenceNumber > lastSequence + 1) {
        requiresFullSync = true
      }
    }

    const latestSequence =
      events.length > 0
        ? events[events.length - 1].sequenceNumber
        : lastSequence

    return {
      events,
      latestSequence,
      requiresFullSync,
    }
  }
}
