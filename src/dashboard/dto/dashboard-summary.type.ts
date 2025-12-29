import { ObjectType, Field, Float, Int } from '@nestjs/graphql'
import { Item } from '../../items/entities/item.entity'

@ObjectType()
export class TopProduct {
  @Field()
  name: string

  @Field(() => Float)
  quantitySold: number
}

@ObjectType()
export class DashboardSummary {
  @Field(() => Float)
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
  salesTrend: number // Resultado de: VentasHoy - VentasAyer

  @Field(() => Float)
  monthlyLosses: number // Dinero perdido por ajustes negativos

  @Field(() => [TopProduct])
  leastSellingProducts: TopProduct[] // Función PRO: Los 3 que menos se venden
}
