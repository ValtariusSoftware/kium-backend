// src/sync/entities/sync-event.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../../users/entities/user.entity'

@Entity({ name: 'sync_events', schema: 'stock_control' })
@Index(['userId', 'sequenceNumber']) // Índice compuesto clave para búsquedas rápidas por usuario y secuencia
export class SyncEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' }) // Si se borra el usuario, vuelan todos sus logs de sincronización
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ type: 'bigint', name: 'sequence_number' })
  sequenceNumber: number // El contador correlativo por usuario

  @Column({ type: 'varchar', length: 50, name: 'entity_type' })
  entityType: string // 'ITEM', 'SALE', 'RECIPE', etc.

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId: string

  @Column({ type: 'varchar', length: 20 })
  action: 'UPSERT' | 'DELETE'

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'origin_client_id',
  })
  originClientId: string | null // Para evitar bucles si el emisor procesa su propio evento

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date
}
