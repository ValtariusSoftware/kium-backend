import { Field, Int, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class ProductMetricsType {
  @Field(() => Int)
  total: number

  @Field(() => Int)
  active: number

  @Field(() => Int)
  alert: number

  @Field(() => Int)
  draft: number

  @Field(() => Int)
  locked: number
}
