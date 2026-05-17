import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ObjectType, Field, ID } from '@nestjs/graphql' // 💡 IMPORTADOS
import { NotificationCampaign } from './notification-campaign.entity'

@Entity({ name: 'notification_campaign_translations', schema: 'stock_control' })
@ObjectType() // 💡 Hace que la clase sea un tipo consultable en GraphQL
export class NotificationCampaignTranslation {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID) // 💡 Expone el ID en GraphQL
  id: string

  @Column({ type: 'varchar', name: 'language_code', length: 10 })
  @Field() // 💡 Expone el código de idioma ('es', 'en', etc.)
  languageCode: string

  @Column({ type: 'text' })
  @Field() // 💡 Expone el título de la notificación
  title: string

  @Column({ type: 'text' })
  @Field() // 💡 Expone el cuerpo de la notificación
  body: string

  @Column({ type: 'uuid', name: 'campaign_id' })
  @Field() // 💡 Expone la clave foránea por si se necesita filtrar por ID de campaña
  campaignId: string

  // Relación inversa con la campaña correspondiente
  @ManyToOne(() => NotificationCampaign, (campaign) => campaign.translations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  // 💡 Nota: No le ponemos @Field acá para evitar una referencia circular infinita en el esquema
  campaign: NotificationCampaign
}
