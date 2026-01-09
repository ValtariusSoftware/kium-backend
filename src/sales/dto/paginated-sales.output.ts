import { ObjectType, Field, Int } from '@nestjs/graphql'
import { Sale } from '../entities/sale.entity'

@ObjectType() // 👈 Esto le dice a GraphQL: "Así se verá la respuesta"
export class PaginatedSales {
  @Field(() => [Sale])
  sales: Sale[]

  @Field(() => Int)
  total: number
}
