import { InputType, Field, ID, PartialType } from '@nestjs/graphql'
import { CreateRecipeInput } from './create-recipe.dto'
import { IsUUID } from 'class-validator'

@InputType()
export class UpdateRecipeInput extends PartialType(CreateRecipeInput) {
  @Field(() => ID)
  @IsUUID()
  id: string
}
