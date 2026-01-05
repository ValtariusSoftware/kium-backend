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
// Importamos el transformer desde la nueva ubicación centralizada
import { ColumnNumericTransformer } from 'src/common/transformers/numeric.transformer'

const numericTransformer = new ColumnNumericTransformer()

@ObjectType()
@Entity({ name: 'sales', schema: 'stock_control' })
export class Sale {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Field(() => Float)
  @Column('decimal', {
    name: 'total_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer, // 👈 CRUCIAL: Para recibir un número y no un string
  })
  totalAmount: number

  @Field()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string

  @Field(() => [InventoryTransaction], { nullable: true })
  @OneToMany(() => InventoryTransaction, (transaction) => transaction.sale)
  items: InventoryTransaction[]

  @Field(() => Boolean)
  @Column({ name: 'is_voided', type: 'boolean', default: false })
  isVoided: boolean
}
