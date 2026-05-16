import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { FirebaseModule } from 'src/firebase/firebase.module' // Importas tu módulo existente
import { NotificationsResolver } from './notifications.resolver'

@Module({
  imports: [FirebaseModule],
  providers: [NotificationsResolver, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
