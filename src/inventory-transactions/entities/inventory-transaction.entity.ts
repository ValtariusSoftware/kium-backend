// inventory-transactions/entities/inventory-transaction.entity.ts
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

@Entity({ name: 'inventory_transactions', schema: 'stock_control' }) // Asegurando el esquema
@ObjectType()
export class InventoryTransaction {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string

  @ManyToOne(() => Item, { nullable: false }) // Relación de TypeORM
  @JoinColumn({ name: 'item_id' })
  @Field(() => Item, { nullable: true }) // 💡 GraphQL Field: Siempre con función de flecha
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

  // Cantidad del movimiento: Positiva para entradas, Negativa para salidas (ej. -50.0)
  @Column('decimal', { scale: 4, precision: 12 })
  @Field(() => Float)
  quantity: number

  // Costo unitario al momento de la transacción (CLAVE para FIFO/Promedio)
  // Se usa para calcular el costo de las entradas (PURCHASE) o el costo de las salidas (SALE/CONSUMPTION)
  @Column('decimal', { scale: 4, precision: 10, name: 'unit_cost_snapshot' })
  @Field(() => Float)
  unitCostSnapshot: number

  // NUEVO CAMPO: Precio de venta al momento de la transacción
  @Column('decimal', {
    scale: 4,
    precision: 10,
    name: 'sale_price_snapshot',
    nullable: true,
    default: 0,
  })
  @Field(() => Float, { nullable: true })
  salePriceSnapshot?: number

  // 💡 CORRECCIÓN: Añadimos () => String explícitamente y usamos ?:
  @Column('varchar', { length: 255, nullable: true, name: 'document_ref' })
  @Field(() => String, { nullable: true })
  documentRef?: string

  // 💡 CORRECCIÓN: Añadimos () => String explícitamente y usamos ?:
  @Column('text', { nullable: true })
  @Field(() => String, { nullable: true })
  notes?: string

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date
}
