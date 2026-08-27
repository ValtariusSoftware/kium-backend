// src/users/models/currency.model.ts
import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType('CurrencyItem')
export class CurrencyModel {
  @Field(() => String)
  code: string

  @Field(() => String)
  name: string

  @Field(() => String)
  symbol: string
}
