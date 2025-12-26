// sales/entities/sale.entity.ts

import { ObjectType, Field, ID, Float } from '@nestjs/graphql'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm'
import { User } from '../../users/entities/user.entity'
import { InventoryTransaction } from '../../inventory-transactions/entities/inventory-transaction.entity'

@ObjectType()
@Entity({ name: 'sales', schema: 'stock_control' }) // 👈 Especificamos esquema
export class Sale {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Field(() => Float)
  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  }) // 👈 Coincide con migración
  totalAmount: number

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' }) // 👈 Importante para el Join
  user: User

  @Column({ name: 'user_id', type: 'varchar', length: 255 }) // 👈 Coincide con tu DDL de Items/Transactions
  userId: string

  @Field(() => [InventoryTransaction], { nullable: true })
  @OneToMany(() => InventoryTransaction, (transaction) => transaction.sale)
  items: InventoryTransaction[]

  @Field(() => Boolean)
  @Column({ name: 'is_voided', type: 'boolean', default: false })
  isVoided: boolean
}
