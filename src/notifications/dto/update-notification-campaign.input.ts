import { InputType, Field, ID, PartialType } from '@nestjs/graphql'
import { CreateNotificationCampaignInput } from './create-notification-campaign.input'

@InputType()
export class UpdateNotificationCampaignInput extends PartialType(
  CreateNotificationCampaignInput,
) {
  @Field(() => ID)
  id: string // Obligatorio para saber qué campaña actualizar
}
