import { ObjectType, Field, Float, Int } from '@nestjs/graphql'
import { Transform } from 'class-transformer'
import { Item } from '../../items/entities/item.entity'

@ObjectType()
export class TopProduct {
  @Field()
  name: string

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(4))) // Cantidades vendidas (ej. kg) a 4 decimales
  quantitySold: number
}

@ObjectType()
export class DashboardSummary {
  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2))) // Dinero a 2 decimales
  monthlyNetProfit: number

  @Field(() => Int)
  lowStockCount: number

  @Field(() => [Item])
  lowStockPreview: Item[]

  @Field(() => [TopProduct])
  topSellingProducts: TopProduct[]

  @Field(() => Int)
  totalSalesMonth: number

  @Field(() => Int)
  salesTrend: number

  @Field(() => Float)
  @Transform(({ value }) => Number(value.toFixed(2))) // Dinero a 2 decimales
  monthlyLosses: number

  @Field(() => [TopProduct])
  leastSellingProducts: TopProduct[]
}
