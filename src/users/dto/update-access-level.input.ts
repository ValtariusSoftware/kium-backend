import { InputType, Field } from '@nestjs/graphql'
import { AccessLevel } from '../entities/user.entity'
import { IsEnum } from 'class-validator' // 👈 Agregá esto si lo usás

@InputType()
export class UpdateAccessLevelInput {
  @Field(() => AccessLevel)
  @IsEnum(AccessLevel) // 👈 Valida que el valor sea correcto antes de entrar al resolver
  level: AccessLevel
}
