import { Resolver, Mutation } from '@nestjs/graphql'
import { NotificationsService } from './notifications.service'
import { User } from 'src/users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'

@Resolver()
export class NotificationsResolver {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Mutation(() => Boolean)
  async sendTestNotification(@CurrentUser() user: User): Promise<boolean> {
    await this.notificationsService.sendPushNotification(
      user.fcmTokens,
      '¡Hola desde Kium! 🚀',
      'Si estás leyendo esto, las notificaciones funcionan de diez.',
    )
    return true
  }
}
