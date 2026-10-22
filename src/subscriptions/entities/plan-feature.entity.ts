import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ObjectType, Field, ID } from '@nestjs/graphql'
import { GraphQLJSON } from 'graphql-scalars'
import { Plan } from './plan.entity'
import { SubscriptionFeature } from './subscription-feature.entity'

@Entity({ name: 'plan_features', schema: 'stock_control' })
@ObjectType()
export class PlanFeature {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  @Column({ name: 'plan_id', type: 'varchar', length: 50 })
  planId: string

  @Column({ name: 'feature_id', type: 'uuid' })
  featureId: string

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  @Field(() => Boolean)
  isEnabled: boolean

  @Column({ name: 'limits', type: 'jsonb', nullable: true })
  @Field(() => GraphQLJSON, { nullable: true })
  limits?: any

  @ManyToOne(() => Plan, (plan) => plan.planFeatures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan

  @ManyToOne(() => SubscriptionFeature, (feature) => feature.planFeatures, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'feature_id' })
  feature: SubscriptionFeature
}
