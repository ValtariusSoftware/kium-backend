import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToOne,
} from 'typeorm'
import { ObjectType, Field, ID, registerEnumType, Float } from '@nestjs/graphql'
import { User } from '../../users/entities/user.entity'
import { Recipe } from 'src/recipes/entities/recipe.entity'

// --- ENUMS CRUCIALES ---

// 2. Enum para la Unidad Base (Necesario para las recetas)
export enum BaseUnit {
  // Unidades de Conteo y Agrupación
  UNIT = 'UNIT', // Para items individuales (ej. una silla, una botella)
  PACK = 'PACK', // Paquetes (ej. cigarrillos, paquetes de galletas)
  BOX = 'BOX', // Cajas o cartones
  ROLL = 'ROLL', // Rollos (ej. papel de aluminio, cinta)
  BAG = 'BAG', // Bolsas o sacos (ej. cemento, harina)
  PALLET = 'PALLET', // Palets (para inventario a gran escala)

  // Unidades de Longitud (Dimensiones Lineales)
  METER = 'METER', // Metros (cables, telas, tuberías)
  CENTIMETER = 'CENTIMETER',
  MILLIMETER = 'MILLIMETER',
  FOOT = 'FOOT', // Pies
  YARD = 'YARD', // Yardas

  // Unidades de Superficie
  SQUARE_METER = 'SQUARE_METER', // Metros cuadrados (pisos, azulejos)

  // Unidades de Masa (Peso)
  KILOGRAM = 'KILOGRAM',
  GRAM = 'GRAM',
  MILLIGRAM = 'MILLIGRAM',
  POUND = 'POUND', // Libras
  OUNCE = 'OUNCE', // Onzas

  // Unidades de Volumen (Líquidos y Capacidad)
  LITER = 'LITER',
  MILLILITER = 'MILLILITER',
  GALLON = 'GALLON', // Galón
  FL_OUNCE = 'FL_OUNCE', // Onza fluida
  CUBIC_METER = 'CUBIC_METER', // Metro cúbico (para gran volumen)

  // Unidades de Tiempo / Servicio
  HOUR = 'HOUR', // Para servicios o mano de obra
  DAY = 'DAY',
}

// 💡 Registrar Enums para GraphQL
registerEnumType(BaseUnit, { name: 'BaseUnit' })

// --- ENTIDAD ---

@Entity({ name: 'items', schema: 'stock_control' })
@ObjectType()
export class Item {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  userId: string

  // Relación: Muchos Ítems pertenecen a un Usuario
  @ManyToOne(() => User, (user) => user.items)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column('varchar', { length: 255 })
  @Field()
  name: string

  // Cantidad disponible, usamos Float para permitir decimales (ej. 1.5 Litros)
  @Column('decimal', { default: 0, scale: 4, precision: 10 })
  @Field(() => Float)
  stock: number

  @Column({
    type: 'enum',
    enum: BaseUnit,
    name: 'base_unit',
  })
  @Field(() => BaseUnit)
  baseUnit: BaseUnit // Ej. 'LITER'

  // Factor de conversión: 1 unidad de stock = X unidades base (ej. 1 Caja = 12 Litros)
  @Column('decimal', {
    scale: 4,
    precision: 10,
    name: 'conversion_to_base_qty',
  })
  @Field(() => Float)
  conversionToBaseQty: number

  @Column('decimal', {
    nullable: true,
    scale: 2,
    precision: 10,
    name: 'min_stock_alert',
  })
  @Field(() => Float, { nullable: true })
  minStockAlert: number | null

  @Column('decimal', {
    nullable: true,
    scale: 2,
    precision: 10,
    name: 'cost_price',
  })
  @Field(() => Float, { nullable: true })
  costPrice: number | null

  @Column('decimal', {
    nullable: true,
    scale: 2,
    precision: 10,
    name: 'sale_price',
  })
  @Field(() => Float, { nullable: true })
  salePrice: number | null

  @OneToOne(() => Recipe, (recipe) => recipe.finalProduct)
  @Field(() => Recipe, { nullable: true })
  recipe?: Recipe

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'barcode' })
  @Field(() => String, { nullable: true })
  barcode: string | null

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date

  @Column({ unique: false, nullable: true })
  @Field({ nullable: true })
  sku: string

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
}
