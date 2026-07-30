// src/sync/dto/sync-payload.dto.ts
import { Field, Int, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class SyncEventDto {
  @Field(() => String)
  id: string

  @Field(() => String)
  sequenceNumber: number // En GraphQL suele manejarse bien como string/number dependiendo de la config de bigint

  @Field(() => String)
  entityType: string // 'ITEM', 'SALE', etc.

  @Field(() => String)
  entityId: string

  @Field(() => String)
  action: string // 'UPSERT' | 'DELETE'

  @Field(() => String, { nullable: true })
  originClientId: string | null
}

@ObjectType()
export class SyncPayloadDto {
  @Field(() => [SyncEventDto])
  events: SyncEventDto[]

  @Field(() => Int)
  latestSequence: number

  @Field(() => Boolean)
  requiresFullSync: boolean
}
