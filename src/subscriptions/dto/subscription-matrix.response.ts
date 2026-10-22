import { ObjectType, Field, Int } from '@nestjs/graphql'

@ObjectType()
export class FeatureTranslationType {
  @Field()
  languageCode: string

  @Field()
  name: string
}

@ObjectType()
export class PlanFeatureMatrixType {
  @Field()
  featureSlug: string

  @Field()
  isEnabled: boolean

  @Field(() => Int, { nullable: true })
  limitMax?: number

  @Field()
  displayOrder: number

  @Field(() => [FeatureTranslationType])
  translations: FeatureTranslationType[]
}

@ObjectType()
export class SubscriptionPlanMatrixType {
  @Field()
  id: string // FREE, PRO, PRO_PLUS

  @Field()
  productId: string // El ID para cuando uses RevenueCat/Mercado Pago

  @Field()
  name: string

  @Field()
  description: string

  @Field()
  priceDisplay: string // 👈 El precio textual listo para pintar en el frontend (ej. "$0", "ARS 8,999", "ARS 18,999")

  @Field()
  periodSuffix: string // Ej. "/mes"

  @Field(() => [PlanFeatureMatrixType])
  features: PlanFeatureMatrixType[]
}

@ObjectType()
export class SubscriptionMatrixResponseDto {
  @Field(() => [SubscriptionPlanMatrixType])
  plansMatrix: SubscriptionPlanMatrixType[]

  @Field(() => [String])
  freeInformativeFeatures: string[]
}
