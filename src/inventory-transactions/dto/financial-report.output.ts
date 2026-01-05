import { ObjectType, Field, Float } from '@nestjs/graphql'
import { Transform } from 'class-transformer'

@ObjectType()
export class FinancialDataPoint {
  @Field()
  label: string

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2)))
  revenue: number

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2)))
  cost: number

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2)))
  losses: number

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2)))
  netProfit: number // Revenue - Cost - Losses
}

@ObjectType()
export class FinancialReportResponse {
  @Field(() => [FinancialDataPoint])
  data: FinancialDataPoint[]

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2)))
  totalNetProfit: number
}
