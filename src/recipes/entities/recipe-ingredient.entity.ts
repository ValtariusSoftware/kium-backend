import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ObjectType, Field, ID, Float } from '@nestjs/graphql'
import { Recipe } from './recipe.entity'
import { Item } from '../../items/entities/item.entity'
import { BaseUnit } from '../../items/entities/item.entity' // Reutilizamos el Enum BaseUnit

@Entity({ name: 'recipe_ingredients', schema: 'stock_control' })
@ObjectType()
export class RecipeIngredient {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id: string

  // 1. Relación con la Receta (Encabezado)
  @ManyToOne(() => Recipe, (recipe) => recipe.ingredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recipe_id' })
  recipe: Recipe

  @Column('uuid', { name: 'recipe_id' })
  recipeId: string

  // 2. Relación con el Ingrediente (Ítem)
  @ManyToOne(() => Item, { onDelete: 'RESTRICT' }) // No podemos eliminar un ingrediente si se usa en una receta
  @JoinColumn({ name: 'ingredient_item_id' })
  ingredientItem: Item

  @Column('uuid', { name: 'ingredient_item_id' })
  ingredientItemId: string

  // Cantidad requerida (ej. 1.5)
  @Column('decimal', { scale: 4, precision: 10, name: 'quantity_required' })
  @Field(() => Float)
  quantityRequired: number

  // Unidad de la cantidad requerida (Debe ser la BaseUnit del ítem, ej. LITER)
  @Column({ type: 'enum', enum: BaseUnit, name: 'unit_of_measure' })
  @Field(() => BaseUnit)
  unitOfMeasure: BaseUnit

  // Nota (Opcional)
  @Column('varchar', { length: 255, nullable: true })
  @Field({ nullable: true })
  notes?: string
}
