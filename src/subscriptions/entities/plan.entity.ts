import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm'
import { ObjectType, Field, ID } from '@nestjs/graphql'
import { PlanFeature } from './plan-feature.entity'

@Entity({ name: 'plans', schema: 'stock_control' })
@ObjectType()
export class Plan {
  @PrimaryColumn('varchar', { length: 50 })
  @Field(() => ID)
  id: string // Ej: 'FREE', 'DEMO', 'PRO', 'PRO_PLUS'

  @Column('varchar', { length: 100, unique: true })
  @Field()
  name: string // Ej: 'Plan Free', 'Plan Pro+'

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Field(() => Boolean)
  isActive: boolean

  @Column({ name: 'display_order', type: 'int', default: 0 })
  @Field()
  displayOrder: number

  @OneToMany(() => PlanFeature, (pf) => pf.plan, { cascade: true })
  planFeatures: PlanFeature[]
}
