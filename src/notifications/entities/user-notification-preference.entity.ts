import {
  Entity,
  Column,
  ManyToOne,
  PrimaryColumn, // 👈 ¡Este es el correcto! Cambiado PrimaryKeyColumn por PrimaryColumn
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm'
import { ObjectType, Field } from '@nestjs/graphql'
import { User } from 'src/users/entities/user.entity'

@Entity({ name: 'user_notification_preferences', schema: 'stock_control' })
@ObjectType()
export class UserNotificationPreference {
  @PrimaryColumn({ type: 'varchar', name: 'user_id', length: 255 }) // 👈 Cambiado acá
  @Field()
  userId: string

  @PrimaryColumn({ type: 'varchar', name: 'campaign_slug', length: 100 }) // 👈 Cambiado acá
  @Field()
  campaignSlug: string

  @Column({ type: 'boolean', name: 'is_enabled', default: true })
  @Field()
  isEnabled: boolean

  @UpdateDateColumn({
    type: 'timestamp',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @Field()
  updatedAt: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User
}
