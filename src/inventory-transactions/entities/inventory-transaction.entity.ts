import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm'
import { Item } from '../../items/entities/item.entity'
import { ObjectType, Field, ID, Float } from '@nestjs/graphql'
import { TransactionType } from '../enums/transaction-type.enum'
import { Sale } from 'src/sales/entities/sale.entity'

import { ColumnNumericTransformer } from 'src/common/transformers/numeric.transformer'
import { User } from 'src/users/entities/user.entity'

const numericTransformer = new ColumnNumericTransformer()

@Entity({ name: 'inventory_transactions', schema: 'stock_control' })
@ObjectType()
export class InventoryTransaction {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  // Agrega la relación ManyToOne para que el CASCADE funcione
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string

  @ManyToOne(() => Item, { nullable: false })
  @JoinColumn({ name: 'item_id' })
  @Field(() => Item, { nullable: true })
  item: Item

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string

  @Column({
    type: 'enum',
    enum: TransactionType,
    name: 'type',
  })
  @Field(() => TransactionType)
  type: TransactionType

  @Column('decimal', {
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  @Field(() => Float)
  quantity: number

  // @Column('decimal', {
  //   precision: 12,
  //   scale: 2, // Dinero: 2 decimales
  //   name: 'unit_cost_snapshot',
  //   transformer: numericTransformer,
  // })
  // @Field(() => Float)
  // unitCostSnapshot: number

  // @Column('decimal', {
  //   precision: 12,
  //   scale: 2, // Dinero: 2 decimales
  //   name: 'sale_price_snapshot',
  //   nullable: true,
  //   default: 0,
  //   transformer: numericTransformer,
  // })
  // @Field(() => Float, { nullable: true })
  // salePriceSnapshot?: number

  @Column('bigint', {
    name: 'unit_cost_snapshot',
    transformer: numericTransformer,
  })
  @Field(() => Float)
  unitCostSnapshot: number

  @Column('bigint', {
    name: 'sale_price_snapshot',
    nullable: true,
    default: 0,
    transformer: numericTransformer,
  })
  @Field(() => Float, { nullable: true })
  salePriceSnapshot?: number

  @Column('varchar', { length: 255, nullable: true, name: 'document_ref' })
  @Field(() => String, { nullable: true })
  documentRef?: string

  @Column('text', { nullable: true })
  @Field(() => String, { nullable: true })
  notes?: string

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date

  @ManyToOne('Sale', 'items', { nullable: true })
  @JoinColumn({ name: 'sale_id' })
  @Field(() => Sale, { nullable: true })
  sale?: Sale

  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId?: string
}
