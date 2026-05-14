import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToOne,
  Unique,
} from 'typeorm'
import { ObjectType, Field, ID, registerEnumType, Float } from '@nestjs/graphql'
import { User } from '../../users/entities/user.entity'
import { Recipe } from 'src/recipes/entities/recipe.entity'
import { ColumnNumericTransformer } from 'src/common/transformers/numeric.transformer'

// --- ENUMS ---

// export enum BaseUnit {
//   UNIT = 'UNIT',
//   PACK = 'PACK',
//   BOX = 'BOX',
//   ROLL = 'ROLL',
//   BAG = 'BAG',
//   PALLET = 'PALLET',
//   METER = 'METER',
//   CENTIMETER = 'CENTIMETER',
//   MILLIMETER = 'MILLIMETER',
//   FOOT = 'FOOT',
//   YARD = 'YARD',
//   SQUARE_METER = 'SQUARE_METER',
//   KILOGRAM = 'KILOGRAM',
//   GRAM = 'GRAM',
//   MILLIGRAM = 'MILLIGRAM',
//   POUND = 'POUND',
//   OUNCE = 'OUNCE',
//   LITER = 'LITER',
//   MILLILITER = 'MILLILITER',
//   GALLON = 'GALLON',
//   FL_OUNCE = 'FL_OUNCE',
//   CUBIC_METER = 'CUBIC_METER',
//   HOUR = 'HOUR',
//   DAY = 'DAY',
// }

export enum BaseUnit {
  // --- DISCRETAS (Universales) ---
  UNIT = 'UNIT',
  PACK = 'PACK',
  BOX = 'BOX',

  // --- MASA ---
  MILLIGRAM = 'MILLIGRAM',
  GRAM = 'GRAM',
  KILOGRAM = 'KILOGRAM',
  OUNCE = 'OUNCE',
  POUND = 'POUND',

  // --- VOLUMEN ---
  MILLILITER = 'MILLILITER',
  LITER = 'LITER',
  FL_OUNCE = 'FL_OUNCE',
  GALLON = 'GALLON',

  // --- LONGITUD ---
  MILLIMETER = 'MILLIMETER', // ¡Vuelve!
  CENTIMETER = 'CENTIMETER',
  METER = 'METER',
  INCH = 'INCH', // Agregamos pulgada que es básica
  FOOT = 'FOOT', // Agregamos pie

  // --- SUPERFICIE ---
  SQUARE_METER = 'SQUARE_METER',
  SQUARE_FOOT = 'SQUARE_FOOT',
}

registerEnumType(BaseUnit, { name: 'BaseUnit' })

const numericTransformer = new ColumnNumericTransformer()

// --- ENTIDAD ---

@Entity({ name: 'items', schema: 'stock_control' })
// Aseguramos que el SKU y el Barcode sean únicos solo dentro del catálogo de cada usuario
@Unique('UQ_ITEM_SKU_PER_USER', ['userId', 'sku'])
@Unique('UQ_ITEM_BARCODE_PER_USER', ['userId', 'barcode'])
@ObjectType()
export class Item {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string

  @ManyToOne(() => User, (user) => user.items)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column('varchar', { length: 255 })
  @Field()
  name: string

  @Column('decimal', {
    default: 0,
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  @Field(() => Float)
  stock: number

  @Column({
    type: 'enum',
    enum: BaseUnit,
    name: 'base_unit',
  })
  @Field(() => BaseUnit)
  baseUnit: BaseUnit

  @Column({
    type: 'enum',
    enum: BaseUnit,
    name: 'purchase_unit',
    nullable: true, // Lo ponemos nullable por los ítems ya existentes
  })
  @Field(() => BaseUnit, { nullable: true })
  purchaseUnit: BaseUnit | null

  @Column('decimal', {
    name: 'conversion_to_base_qty',
    precision: 12,
    scale: 4,
    transformer: numericTransformer,
  })
  @Field(() => Float)
  conversionToBaseQty: number

  @Column('decimal', {
    name: 'min_stock_alert',
    nullable: true,
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  @Field(() => Float, { nullable: true })
  minStockAlert: number | null

  // @Column('decimal', {
  //   name: 'cost_price',
  //   nullable: true,
  //   precision: 12,
  //   scale: 2,
  //   transformer: numericTransformer,
  // })
  // @Field(() => Float, { nullable: true })
  // costPrice: number | null

  // @Column('decimal', {
  //   name: 'sale_price',
  //   nullable: true,
  //   precision: 12,
  //   scale: 2,
  //   transformer: numericTransformer,
  // })
  // @Field(() => Float, { nullable: true })
  // salePrice: number | null

  @Column('bigint', {
    name: 'cost_price',
    nullable: true,
    transformer: numericTransformer,
  })
  @Field(() => Float, { nullable: true }) // En GraphQL seguimos enviando Float para el cliente
  costPrice: number | null // En la lógica de la App será el valor en centavos

  @Column('bigint', {
    name: 'sale_price',
    nullable: true,
    transformer: numericTransformer,
  })
  @Field(() => Float, { nullable: true })
  salePrice: number | null

  @OneToOne(() => Recipe, (recipe) => recipe.finalProduct)
  @Field(() => Recipe, { nullable: true })
  recipe?: Recipe

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'barcode' })
  @Field(() => String, { nullable: true })
  barcode: string | null

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'sku' })
  @Field(() => String, { nullable: true })
  sku: string | null

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date

  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  @Field({ nullable: true })
  deletedAt?: Date

  @Column({ name: 'is_saleable', type: 'boolean', default: false })
  @Field(() => Boolean)
  isSaleable: boolean

  @Column({ name: 'is_produced', type: 'boolean', default: false })
  @Field(() => Boolean)
  isProduced: boolean

  @Column({ name: 'is_purchasable', type: 'boolean', default: true })
  @Field(() => Boolean)
  isPurchasable: boolean

  @Column({ name: 'is_ingredient', type: 'boolean', default: false })
  @Field(() => Boolean)
  isIngredient: boolean

  @Column({ type: 'uuid', name: 'parent_id', nullable: true })
  @Field(() => ID, { nullable: true })
  parentId: string | null

  // Opcional: Una relación lógica para poder hacer un Join si fuera necesario
  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: Item

  @Column({ name: 'is_verified', type: 'boolean', default: true })
  @Field(() => Boolean)
  isVerified: boolean

  @Column({ name: 'is_initialized', type: 'boolean', default: false })
  @Field(() => Boolean)
  isInitialized: boolean
}
