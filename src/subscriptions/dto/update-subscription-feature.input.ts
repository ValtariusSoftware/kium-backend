// dto/update-subscription-feature.input.ts
import { InputType, Field, ID, PartialType } from '@nestjs/graphql'
import { CreateSubscriptionFeatureInput } from './create-subscription-feature.input'

@InputType()
export class UpdateSubscriptionFeatureInput extends PartialType(
  CreateSubscriptionFeatureInput,
) {
  @Field(() => ID)
  id: string
}
