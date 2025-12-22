import { ObjectType, Field, Float } from '@nestjs/graphql'

@ObjectType()
export class FinancialDataPoint {
  @Field()
  label: string // Puede ser "2025-12-19" (día) o "Enero 2025" (mes)

  @Field(() => Float)
  revenue: number // Barra 1: Ganancia Bruta (Ventas)

  @Field(() => Float)
  cost: number // Barra 2: Costos

  @Field(() => Float)
  losses: number // Barra 3: Mermas

  @Field(() => Float)
  netProfit: number // El resultado final (Revenue - Cost - Losses)
}

@ObjectType()
export class FinancialReportResponse {
  @Field(() => [FinancialDataPoint])
  data: FinancialDataPoint[]

  // Totales generales del periodo seleccionado
  @Field(() => Float)
  totalNetProfit: number
}
