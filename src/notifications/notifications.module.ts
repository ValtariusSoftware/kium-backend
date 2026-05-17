import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationsService } from './notifications.service'
import { FirebaseModule } from 'src/firebase/firebase.module' // Importas tu módulo existente
import { NotificationsResolver } from './notifications.resolver'
import { NotificationCampaign } from './entities/notification-campaign.entity'
import { NotificationCampaignTranslation } from './entities/notification-campaign-translation.entity'
import { User } from 'src/users/entities/user.entity'

@Module({
  imports: [
    FirebaseModule,
    // 💎 AGREGADOS LOS REPOSITORIOS REQUERIDOS
    TypeOrmModule.forFeature([
      NotificationCampaign,
      NotificationCampaignTranslation,
      User,
    ]),
  ],
  providers: [NotificationsResolver, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
