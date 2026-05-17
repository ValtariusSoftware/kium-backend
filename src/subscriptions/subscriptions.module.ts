import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SubscriptionFeature } from './entities/subscription-feature.entity'
import { SubscriptionFeatureTranslation } from './entities/subscription-feature-translation.entity'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionsResolver } from './subscriptions.resolver'
import { UsersModule } from 'src/users/users.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { NotificationCampaign } from 'src/notifications/entities/notification-campaign.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionFeature,
      SubscriptionFeatureTranslation,
      NotificationCampaign,
    ]),
    UsersModule,
    NotificationsModule,
  ],
  providers: [SubscriptionsResolver, SubscriptionsService],
  // 🚩 ESTO ES LO QUE FALTA:
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
