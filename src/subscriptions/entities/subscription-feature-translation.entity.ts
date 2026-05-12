import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ObjectType, Field, ID } from '@nestjs/graphql'
import { SubscriptionFeature } from './subscription-feature.entity'

@Entity({ name: 'subscription_feature_translations', schema: 'stock_control' })
@ObjectType()
export class SubscriptionFeatureTranslation {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  @Column('varchar', { length: 10, name: 'language_code' })
  @Field()
  languageCode: string // 'es', 'en', 'pt', etc.

  @Column('text')
  @Field()
  name: string // El texto descriptivo

  @Column({ name: 'feature_id' }) // Columna simple para manejar el ID
  featureId: string

  @ManyToOne(() => SubscriptionFeature, (feature) => feature.translations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'feature_id' })
  feature: SubscriptionFeature
}
