import { InputType, Field } from '@nestjs/graphql'

@InputType()
class NotificationCampaignTranslationInput {
  @Field()
  languageCode: string // 'es', 'en', etc.

  @Field()
  title: string

  @Field()
  body: string
}

@InputType()
export class CreateNotificationCampaignInput {
  @Field()
  slug: string // 'sub_retargeting', 'weekly_closure'

  @Field({ defaultValue: true })
  isActive: boolean

  @Field(() => [NotificationCampaignTranslationInput])
  translations: NotificationCampaignTranslationInput[]
}
