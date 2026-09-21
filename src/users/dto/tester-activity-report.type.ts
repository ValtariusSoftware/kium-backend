import { Field, ObjectType, Int } from '@nestjs/graphql'

@ObjectType()
export class TesterActivityReportType {
  @Field(() => String)
  userId: string

  @Field(() => String, { nullable: true })
  email: string

  @Field(() => String, { nullable: true })
  accessLevel: string

  @Field(() => Int)
  totalProducts: number

  @Field(() => Int)
  totalTransactions: number

  @Field(() => String, { nullable: true })
  lastOperationDate: string
}
