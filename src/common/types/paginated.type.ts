import { Field, ObjectType, Int } from '@nestjs/graphql'
import { Type } from '@nestjs/common'

export function Paginated<T>(classRef: Type<T>) {
  @ObjectType({ isAbstract: true })
  abstract class PaginatedType {
    @Field(() => [classRef])
    items: T[]

    @Field(() => Int)
    total: number
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return PaginatedType as any
}
