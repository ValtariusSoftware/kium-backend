import { ObjectType, Field, Int } from '@nestjs/graphql'
import { TopProduct } from './dashboard-summary.type'

@ObjectType()
export class PaginatedTopProducts {
  @Field(() => [TopProduct])
  items: TopProduct[]

  @Field(() => Int)
  total: number
}
