// src/features/dashboard/dto/paginated-top-products.output.ts
import { ObjectType, Field, Float, ID, Int } from '@nestjs/graphql'
import { Transform } from 'class-transformer'

@ObjectType()
export class DetailedProductItem {
  @Field(() => ID)
  id: string

  @Field()
  name: string

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(4)))
  stock: number

  @Field()
  baseUnit: string

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(4)))
  quantitySold: number
}

@ObjectType()
export class PaginatedTopProducts {
  @Field(() => [DetailedProductItem])
  items: DetailedProductItem[]

  @Field(() => Int)
  total: number
}
