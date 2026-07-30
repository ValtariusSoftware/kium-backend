// src/sync/sync.resolver.ts
import { Resolver, Query, Args, Int } from '@nestjs/graphql'
import { SyncService } from './sync.service'
import { User } from '../users/entities/user.entity' // Ajustá el path según tu entidad de Usuario
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { SyncPayloadDto } from './dto/sync-payload.dto'

@Resolver()
export class SyncResolver {
  constructor(private readonly syncService: SyncService) {}

  @Query(() => SyncPayloadDto, { name: 'getChangesSince' })
  async getChangesSince(
    @Args('lastSequence', { type: () => Int }) lastSequence: number,
    @CurrentUser() user: User,
  ) {
    return this.syncService.getChangesSince(user.id, lastSequence)
  }
}
