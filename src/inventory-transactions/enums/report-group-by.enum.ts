import { registerEnumType } from '@nestjs/graphql'

export enum ReportGroupBy {
  DAY = 'DAY',
  MONTH = 'MONTH',
}

registerEnumType(ReportGroupBy, { name: 'ReportGroupBy' })
