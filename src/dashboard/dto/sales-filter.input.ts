import { InputType, Field } from '@nestjs/graphql'
import { IsOptional, IsString, IsBoolean } from 'class-validator' // 👈 IMPORTANTE

@InputType()
export class SalesFilterInput {
  @Field({ nullable: true })
  @IsOptional() // 👈 Agregá esto
  @IsString() // 👈 Agregá esto
  paymentMethod?: string

  @Field(() => Boolean, { nullable: true })
  @IsOptional() // 👈 Agregá esto
  @IsBoolean() // 👈 Agregá esto
  isVoided?: boolean
}
