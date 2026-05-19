import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationsService } from './notifications.service'
import { FirebaseModule } from 'src/firebase/firebase.module' // Importas tu módulo existente
import { NotificationsResolver } from './notifications.resolver'
import { NotificationCampaign } from './entities/notification-campaign.entity'
import { NotificationCampaignTranslation } from './entities/notification-campaign-translation.entity'
import { User } from 'src/users/entities/user.entity'
import { UserNotificationPreference } from './entities/user-notification-preference.entity'
import { UserCampaignTracker } from './entities/user-campaign-tracker.entity'
import { DashboardModule } from 'src/dashboard/dashboard.module'

@Module({
  imports: [
    FirebaseModule,
    DashboardModule,
    // 💎 AGREGADOS LOS REPOSITORIOS REQUERIDOS
    TypeOrmModule.forFeature([
      NotificationCampaign,
      NotificationCampaignTranslation,
      UserNotificationPreference,
      UserCampaignTracker,
      User,
    ]),
  ],
  providers: [NotificationsResolver, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
