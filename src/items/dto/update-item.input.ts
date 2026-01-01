import { InputType, Field, ID, PartialType } from '@nestjs/graphql'
import { CreateItemInput } from './create-item.dto' // <-- Asegúrate de que esta ruta sea correcta
import { IsUUID } from 'class-validator'

@InputType()
export class UpdateItemInput extends PartialType(CreateItemInput) {
  @Field(() => ID)
  @IsUUID()
  id: string
}
