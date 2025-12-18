import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm'
import { ObjectType, Field, ID, Float } from '@nestjs/graphql'
import { Item } from '../../items/entities/item.entity'
import { User } from '../../users/entities/user.entity'
import { RecipeIngredient } from './recipe-ingredient.entity'

@Entity({ name: 'recipes', schema: 'stock_control' })
@ObjectType()
export class Recipe {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  // 1. Relación con el Producto Final (FINAL_PRODUCT)
  // Un producto final (Item de tipo FINAL_PRODUCT) tiene una sola receta.
  @OneToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'final_product_id' })
  finalProduct: Item

  @Column('uuid', { name: 'final_product_id', unique: true })
  finalProductId: string

  // Relación con el Usuario (Para filtrar el acceso a las recetas)
  @ManyToOne(() => User, (user) => user.recipes)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  @Field()
  userId: string

  // Cantidad de Producto Final que se produce al completar esta receta (ej. 1 litro de helado)
  @Column('decimal', { scale: 4, precision: 10, name: 'yield_quantity' })
  @Field(() => Float)
  yieldQuantity: number

  // 2. Relación con los Ingredientes (Líneas de Detalle)
  @OneToMany(() => RecipeIngredient, (ingredient) => ingredient.recipe, {
    cascade: ['insert'], // Si creamos la receta, creamos sus ingredientes
  })
  @Field(() => [RecipeIngredient])
  ingredients: RecipeIngredient[]

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date
}
