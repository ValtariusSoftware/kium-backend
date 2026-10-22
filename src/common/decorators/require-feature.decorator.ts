// src/common/decorators/require-feature.decorator.ts
import { SetMetadata } from '@nestjs/common'
import { SubscriptionFeatureSlug } from 'src/subscriptions/enums/subscription-feature-slug.enum'

export const FEATURE_KEY = 'required_feature'
export const RequireFeature = (feature: SubscriptionFeatureSlug) =>
  SetMetadata(FEATURE_KEY, feature)
