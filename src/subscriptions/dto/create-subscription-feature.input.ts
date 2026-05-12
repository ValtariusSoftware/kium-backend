import { InputType, Field, Int } from '@nestjs/graphql'
import { GraphQLJSON } from 'graphql-scalars'

@InputType()
export class FeatureTranslationInput {
  @Field()
  languageCode: string

  @Field()
  name: string
}

@InputType()
export class CreateSubscriptionFeatureInput {
  @Field()
  slug: string

  @Field(() => Boolean)
  isFree: boolean

  @Field(() => Boolean)
  isPro: boolean

  @Field(() => Boolean, { defaultValue: true })
  isActive: boolean

  @Field(() => Boolean, { defaultValue: false })
  isHighlighted: boolean

  @Field(() => GraphQLJSON, { nullable: true }) // 👈 USAR EL SCALAR AQUÍ
  limits?: any

  @Field(() => Int)
  displayOrder: number

  @Field(() => [FeatureTranslationInput])
  translations: FeatureTranslationInput[]
}
