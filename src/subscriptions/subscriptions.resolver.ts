import { Resolver, Query, Args, Mutation } from '@nestjs/graphql'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionFeature } from './entities/subscription-feature.entity'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { CreateSubscriptionFeatureInput } from './dto/create-subscription-feature.input'
import { UpdateSubscriptionFeatureInput } from './dto/update-subscription-feature.input'
import { SubscriptionMatrixResponseDto } from './dto/subscription-matrix.response'
import { Public } from 'src/common/decorators/public.decorator'

@Resolver(() => SubscriptionFeature)
export class SubscriptionsResolver {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // Query unificada para traer la matriz completa de características y límites agrupados por plan
  @Public()
  @Query(() => SubscriptionMatrixResponseDto, {
    name: 'subscriptionPlansMatrix',
  })
  async getSubscriptionPlansMatrix(
    @Args('lang', { type: () => String, nullable: true }) lang?: string,
    @Args('clientPlatform', { type: () => String, nullable: true })
    clientPlatform?: 'android' | 'web',
  ) {
    return this.subscriptionsService.getSubscriptionMatrix(
      lang,
      clientPlatform || 'android',
    )
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

  @Mutation(() => Boolean, {
    description: 'Registra cuando un usuario entra a ver los precios',
  })
  async logSubscriptionView(@CurrentUser() user: User): Promise<boolean> {
    return this.subscriptionsService.trackSubscriptionView(user.id)
  }
}
