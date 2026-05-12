import { Resolver, Query, Args, Mutation } from '@nestjs/graphql'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionFeature } from './entities/subscription-feature.entity'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { CreateSubscriptionFeatureInput } from './dto/create-subscription-feature.input'
import { UpdateSubscriptionFeatureInput } from './dto/update-subscription-feature.input'

@Resolver(() => SubscriptionFeature)
export class SubscriptionsResolver {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Query(() => [SubscriptionFeature], { name: 'subscriptionManifest' })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSubscriptionManifest(@CurrentUser() user: User) {
    // Ahora traemos todo el paquete completo de idiomas
    return this.subscriptionsService.findAll()
  }

  @Query(() => Date, { name: 'subscriptionLastUpdate' })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getLastUpdate(@CurrentUser() user: User) {
    return this.subscriptionsService.getLatestUpdate()
  }

  @Query(() => [SubscriptionFeature], {
    name: 'subscriptionFeaturesByLanguage',
  })
  async getFeaturesByLanguage(
    @Args('lang', { type: () => String }) lang: string,
  ) {
    return this.subscriptionsService.findByLanguage(lang)
  }

  @Mutation(() => [SubscriptionFeature])
  async createSubscriptionFeatures(
    @Args({ name: 'inputs', type: () => [CreateSubscriptionFeatureInput] })
    inputs: CreateSubscriptionFeatureInput[],
  ) {
    return this.subscriptionsService.createMany(inputs)
  }

  @Mutation(() => [SubscriptionFeature]) // 👈 Agregamos esta que faltaba
  async updateSubscriptionFeatures(
    @Args({ name: 'inputs', type: () => [UpdateSubscriptionFeatureInput] })
    inputs: UpdateSubscriptionFeatureInput[],
  ) {
    return this.subscriptionsService.updateMany(inputs)
  }

  @Mutation(() => Boolean)
  async removeSubscriptionFeatures(
    @Args({ name: 'ids', type: () => [String] }) ids: string[],
  ) {
    return this.subscriptionsService.removeMany(ids)
  }
}
