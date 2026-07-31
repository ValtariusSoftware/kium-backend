import { Injectable, Logger } from '@nestjs/common'
import { SyncEventEntity } from './entities/sync-event.entity'
import { DataSource, MoreThan, QueryRunner, Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron } from '@nestjs/schedule'

// src/sync/sync.service.ts
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)
  constructor(
    @InjectRepository(SyncEventEntity)
    private readonly syncEventRepo: Repository<SyncEventEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // 🧹 CRON DE LIMPIEZA: Corre cada 30 días en producción (o puedes usar CronExpression.EVERY_10_SECONDS para pruebas)
  @Cron('0 0 3 */15 * *') // Se ejecuta a las 03:00 AM cada 15 días exactos del mes
  async handleOldSyncEventsCleanup() {
    this.logger.log(
      '🧹 [Cron] Iniciando limpieza de eventos de sincronización antiguos (15 días)...',
    )

    const fifteenDaysAgo = new Date()
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15)

    try {
      const result = await this.syncEventRepo
        .createQueryBuilder()
        .delete()
        .from(SyncEventEntity)
        .where('createdAt < :date', { date: fifteenDaysAgo })
        .execute()

      this.logger.log(
        `🧹 [Cron] Limpieza finalizada. Eventos eliminados: ${result.affected || 0}`,
      )
    } catch (error) {
      this.logger.error(
        '❌ [Cron] Error al limpiar eventos antiguos de sincronización:',
        error,
      )
    }
  }

  // @Cron('0 0 */2 * * *') // Se ejecuta al minuto 0 de cada 2 horas
  // async handleOldSyncEventsCleanup() {
  //   this.logger.log(
  //     '🧹 [Cron PRUEBAS] Iniciando limpieza de eventos de sincronización (Modo Test: 2 horas)...',
  //   )

  //   // Borramos lo que tenga más de 2 horas de creado
  //   const twoHoursAgo = new Date()
  //   twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)

  //   try {
  //     const result = await this.syncEventRepo
  //       .createQueryBuilder()
  //       .delete()
  //       .from(SyncEventEntity)
  //       .where('createdAt < :date', { date: twoHoursAgo })
  //       .execute()

  //     this.logger.log(
  //       `🧹 [Cron PRUEBAS] Limpieza finalizada. Eventos eliminados: ${result.affected || 0}`,
  //     )
  //   } catch (error) {
  //     this.logger.error('❌ [Cron PRUEBAS] Error al limpiar eventos:', error)
  //   }
  // }

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
