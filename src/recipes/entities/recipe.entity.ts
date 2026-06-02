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

import { ColumnNumericTransformer } from 'src/common/transformers/numeric.transformer'

const numericTransformer = new ColumnNumericTransformer()

@Entity({ name: 'recipes', schema: 'stock_control' })
@ObjectType()
export class Recipe {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  // 1. Relación con el Producto Final
  @OneToOne(() => Item, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'final_product_id' })
  @Field(() => Item)
  finalProduct: Item

  @Column('uuid', { name: 'final_product_id', unique: true })
  finalProductId: string

  // Relación con el Usuario
  @ManyToOne(() => User, (user) => user.recipes)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ type: 'varchar', length: 255, name: 'user_id' })
  @Field()
  userId: string

  // Cantidad de Producto Final que rinde la receta
  @Column('decimal', {
    precision: 12,
    scale: 4,
    name: 'yield_quantity',
    transformer: numericTransformer,
  })
  @Field(() => Float)
  yieldQuantity: number

  // 2. Relación con los Ingredientes
  @OneToMany(() => RecipeIngredient, (ingredient) => ingredient.recipe, {
    cascade: ['insert'],
  })
  @Field(() => [RecipeIngredient])
  ingredients: RecipeIngredient[]

  @Column({
    type: 'boolean',
    name: 'is_recipe_structure_verified',
    default: true, // Las recetas viejas nacen verificadas
  })
  @Field(() => Boolean)
  isRecipeStructureVerified: boolean

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  @Field()
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  @Field()
  updatedAt: Date
}
