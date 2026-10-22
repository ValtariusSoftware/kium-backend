import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm'
import { ObjectType, Field, ID } from '@nestjs/graphql'
import { SubscriptionFeatureTranslation } from './subscription-feature-translation.entity'
import { PlanFeature } from './plan-feature.entity'

@Entity({ name: 'subscription_features', schema: 'stock_control' })
@ObjectType()
export class SubscriptionFeature {
  @PrimaryGeneratedColumn('uuid') // Usamos UUID como en tus otros registros
  @Field(() => ID)
  id: string

  @Column('varchar', { length: 100, unique: true })
  @Field()
  slug: string

  @Column({ name: 'is_active', type: 'boolean', default: true }) // 👈 Nuevo
  @Field(() => Boolean)
  isActive: boolean

  @Column({ name: 'is_highlighted', type: 'boolean', default: false }) // 👈 Nuevo
  @Field(() => Boolean)
  isHighlighted: boolean

  @Column({ name: 'display_order', type: 'int', default: 0 })
  @Field()
  displayOrder: number

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date

  @OneToMany(() => SubscriptionFeatureTranslation, (t) => t.feature, {
    cascade: true, // 👈 CRUCIAL: Esto permite que .save() guarde también los hijos
  })
  @Field(() => [SubscriptionFeatureTranslation])
  translations: SubscriptionFeatureTranslation[]

  // 💎 NUEVA RELACIÓN: Una feature puede estar en muchos plan_features
  @OneToMany(() => PlanFeature, (pf) => pf.feature)
  planFeatures: PlanFeature[]
}
