import { ObjectType, Field, Int } from '@nestjs/graphql'
import { Item } from 'src/items/entities/item.entity'

@ObjectType()
export class PaginatedLowStock {
  @Field(() => [Item])
  items: Item[]

  @Field(() => Int)
  total: number
}
