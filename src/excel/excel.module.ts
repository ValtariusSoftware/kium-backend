import { Module } from '@nestjs/common'
import { ExcelService } from './excel.service'
import { ExcelParserService } from './excel-parser.service'

@Module({
  providers: [ExcelService, ExcelParserService],
  exports: [ExcelService, ExcelParserService],
})
export class ExcelModule {}
