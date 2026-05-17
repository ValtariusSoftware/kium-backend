import { Resolver, Query, Args, Mutation } from '@nestjs/graphql'
import { NotificationsService } from './notifications.service'
import { NotificationCampaign } from './entities/notification-campaign.entity'
import { CreateNotificationCampaignInput } from './dto/create-notification-campaign.input'
import { UpdateNotificationCampaignInput } from './dto/update-notification-campaign.input'
import { User } from 'src/users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'

@Resolver(() => NotificationCampaign)
export class NotificationsResolver {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Consultar todas las campañas (Útil para listados en el Admin)
  @Query(() => [NotificationCampaign], { name: 'notificationCampaigns' })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCampaigns(@CurrentUser() user: User) {
    return this.notificationsService.findAll()
  }

  // Crear campañas de notificación en lote
  @Mutation(() => [NotificationCampaign])
  async createNotificationCampaigns(
    @Args({ name: 'inputs', type: () => [CreateNotificationCampaignInput] })
    inputs: CreateNotificationCampaignInput[],
  ) {
    return this.notificationsService.createMany(inputs)
  }

  // Modificar textos o estados de las campañas
  @Mutation(() => [NotificationCampaign])
  async updateNotificationCampaigns(
    @Args({ name: 'inputs', type: () => [UpdateNotificationCampaignInput] })
    inputs: UpdateNotificationCampaignInput[],
  ) {
    return this.notificationsService.updateMany(inputs)
  }

  // Eliminar físicamente una campaña
  @Mutation(() => Boolean)
  async removeNotificationCampaigns(
    @Args({ name: 'ids', type: () => [String] }) ids: string[],
  ) {
    return this.notificationsService.removeMany(ids)
  }
}
