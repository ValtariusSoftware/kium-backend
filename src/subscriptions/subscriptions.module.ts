import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SubscriptionFeature } from './entities/subscription-feature.entity'
import { SubscriptionFeatureTranslation } from './entities/subscription-feature-translation.entity'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionsResolver } from './subscriptions.resolver'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionFeature,
      SubscriptionFeatureTranslation,
    ]),
  ],
  providers: [SubscriptionsResolver, SubscriptionsService],
  // 🚩 ESTO ES LO QUE FALTA:
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
