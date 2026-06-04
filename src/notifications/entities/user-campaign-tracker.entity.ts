import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm'
import { ObjectType, Field } from '@nestjs/graphql'
import { User } from 'src/users/entities/user.entity'

@Entity({ name: 'user_campaign_tracker', schema: 'stock_control' })
@ObjectType()
export class UserCampaignTracker {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 255 })
  @Field(() => String) // 👈 Forzado explícito
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @PrimaryColumn({ name: 'campaign_slug', type: 'varchar', length: 100 })
  @Field(() => String) // 👈 Forzado explícito
  campaignSlug: string

  @Column({
    type: 'timestamp',
    name: 'last_triggered_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @Field(() => Date) // 💎 CLAVE: Esto le dice a GraphQL exactamente cómo tratar la fecha
  lastTriggeredAt: Date

  @Column({
    type: 'timestamp',
    name: 'last_notified_at',
    nullable: true,
  })
  @Field(() => Date, { nullable: true }) // 💎 CLAVE: Evita que el 'Date | null' de abajo rompa el motor
  lastNotifiedAt: Date | null
}
