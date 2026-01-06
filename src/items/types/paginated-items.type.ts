import { ObjectType, Field, Int } from '@nestjs/graphql'
import { Item } from '../entities/item.entity'

@ObjectType()
export class PaginatedItems {
  @Field(() => [Item])
  items: Item[]

  @Field(() => Int)
  total: number
}
