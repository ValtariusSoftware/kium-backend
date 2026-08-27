import { ObjectType, Field } from '@nestjs/graphql'

@ObjectType()
export class CurrencyType {
  @Field(() => String)
  code: string // Ej: 'CAD', 'ARS', 'EUR'

  @Field(() => String)
  name: string // Traducido al idioma del usuario (ej: 'Dólar canadiense')

  @Field(() => String)
  symbol: string // Ej: '$', '€'
}
