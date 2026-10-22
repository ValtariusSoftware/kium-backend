import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SubscriptionFeature } from './entities/subscription-feature.entity'
import { SubscriptionFeatureTranslation } from './entities/subscription-feature-translation.entity'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionsResolver } from './subscriptions.resolver'
import { UsersModule } from 'src/users/users.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { NotificationCampaign } from 'src/notifications/entities/notification-campaign.entity'
import { UserCampaignTracker } from 'src/notifications/entities/user-campaign-tracker.entity'
import { Plan } from './entities/plan.entity'
import { PlanFeature } from './entities/plan-feature.entity'
import { EntitlementsService } from './entitlements.service'
import { CatalogPolicyService } from './catalog-policy.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionFeature,
      SubscriptionFeatureTranslation,
      Plan,
      PlanFeature,
      NotificationCampaign,
      UserCampaignTracker,
    ]),
    forwardRef(() => UsersModule),
    NotificationsModule,
  ],
  providers: [
    SubscriptionsResolver,
    SubscriptionsService,
    EntitlementsService,
    CatalogPolicyService,
  ],
  // 🚩 ESTO ES LO QUE FALTA:
  exports: [SubscriptionsService, EntitlementsService, CatalogPolicyService],
})
export class SubscriptionsModule {}
