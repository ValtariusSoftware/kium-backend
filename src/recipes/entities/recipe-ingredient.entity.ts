import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ObjectType, Field, ID, Float } from '@nestjs/graphql'
import { Recipe } from './recipe.entity'
import { Item, BaseUnit } from '../../items/entities/item.entity'

import { ColumnNumericTransformer } from 'src/common/transformers/numeric.transformer'

const numericTransformer = new ColumnNumericTransformer()

@Entity({ name: 'recipe_ingredients', schema: 'stock_control' })
@ObjectType()
export class RecipeIngredient {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  @ManyToOne(() => Recipe, (recipe) => recipe.ingredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recipe_id' })
  recipe: Recipe

  @Column('uuid', { name: 'recipe_id' })
  recipeId: string

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ingredient_item_id' })
  @Field(() => Item)
  ingredientItem: Item

  @Column('uuid', { name: 'ingredient_item_id' })
  @Field(() => ID)
  ingredientItemId: string

  @Column('decimal', {
    precision: 12,
    scale: 4,
    name: 'quantity_required',
    transformer: numericTransformer,
  })
  @Field(() => Float)
  quantityRequired: number

  @Column({
    type: 'enum',
    enum: BaseUnit, // Esto es lo que le faltaba según el error
    enumName: 'BaseUnit', // Nombre del tipo en Postgres (esquema stock_control)
    name: 'unit_of_measure',
  })
  @Field(() => BaseUnit)
  unitOfMeasure: BaseUnit

  @Column('varchar', { length: 255, nullable: true })
  @Field({ nullable: true })
  notes?: string
}
