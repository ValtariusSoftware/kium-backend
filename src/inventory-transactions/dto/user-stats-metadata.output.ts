import { ObjectType, Field } from '@nestjs/graphql'

@ObjectType()
export class UserStatsMetadata {
  @Field(() => String)
  firstMonth: string

  @Field(() => String)
  lastMonth: string
}
