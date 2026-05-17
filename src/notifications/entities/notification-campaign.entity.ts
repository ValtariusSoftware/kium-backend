import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm'
import { ObjectType, Field, ID } from '@nestjs/graphql' // 💡 IMPORTADOS
import { NotificationCampaignTranslation } from './notification-campaign-translation.entity'

@Entity({ name: 'notification_campaigns', schema: 'stock_control' })
@ObjectType() // 💡 Hace que la clase sea un tipo consultable en GraphQL
export class NotificationCampaign {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID) // 💡 Expone el ID en GraphQL
  id: string

  @Column({ type: 'varchar', length: 100, unique: true })
  @Field() // 💡 Expone el slug
  slug: string // Ej: 'sub_retargeting', 'weekly_closure', 'star_product_month'

  @Column({ type: 'boolean', name: 'is_active', default: true })
  @Field() // 💡 Expone el estado activo/inactivo
  isActive: boolean

  @UpdateDateColumn({
    type: 'timestamp',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @Field() // 💡 Expone la fecha de actualización
  updatedAt: Date

  // Relación con todas sus traducciones disponibles
  @OneToMany(
    () => NotificationCampaignTranslation,
    (translation) => translation.campaign,
    { cascade: true },
  )
  @Field(() => [NotificationCampaignTranslation]) // 💡 Expone el array de traducciones en GraphQL
  translations: NotificationCampaignTranslation[]
}
