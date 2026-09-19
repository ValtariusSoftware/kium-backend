import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import * as ExcelJS from 'exceljs'
import * as fsSync from 'fs' // Para operaciones síncronas (constructor)
import * as fs from 'fs/promises' // Para operaciones asíncronas (cleanup)
import * as path from 'path'
import { I18N_EXCEL } from 'src/common/i18n/excel-headers'
import { VALIDATION_MESSAGES } from 'src/common/i18n/validation-messages.translations'

export interface DropdownConfig {
  options: { label: string; value: string }[]
}

export interface ColumnConfig {
  header: string
  key: string
  width?: number
  dropdown?: DropdownConfig
}

@Injectable()
export class ExcelService {
  private readonly tempDir = path.join(process.cwd(), 'temp-excels')

  constructor() {
    // Usamos fsSync para asegurar que la carpeta exista al arrancar
    if (!fsSync.existsSync(this.tempDir)) fsSync.mkdirSync(this.tempDir)
  }

  private async cleanupTempFiles() {
    try {
      // Ahora fs es 'fs/promises', así que readdir funciona con await
      const files = await fs.readdir(this.tempDir)
      const now = Date.now()
      const ONE_HOUR = 60 * 60 * 1000

      for (const file of files) {
        const filePath = path.join(this.tempDir, file)
        const stats = await fs.stat(filePath) // Ahora stat devuelve una promesa

        if (now - stats.birthtimeMs > ONE_HOUR) {
          await fs.unlink(filePath) // Ahora unlink devuelve una promesa
        }
      }
    } catch (err) {
      console.error('Error en limpieza de archivos:', err)
    }
  }

  // @Cron('*/5 * * * *')
  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    console.log('Iniciando limpieza programada de archivos temporales...')
    await this.cleanupTempFiles()
    console.log('Limpieza finalizada.')
  }

  async generate(
    columns: ColumnConfig[],
    lang: string = 'en',
    productType: string = 'resale', // <--- Recibimos el tipo de producto
  ): Promise<string> {
    const langData = I18N_EXCEL[lang] || I18N_EXCEL['en']

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(langData.sheetName)

    const errorMessage = VALIDATION_MESSAGES[lang] || VALIDATION_MESSAGES['en']

    sheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width || 20,
    }))

    columns.forEach((col, index) => {
      if (col.dropdown) {
        const colNumber = index + 1
        const labels = col.dropdown.options.map((opt) => opt.label)

        for (let row = 2; row <= 3000; row++) {
          const cell = sheet.getCell(row, colNumber)

          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${labels.join(',')}"`],
            showErrorMessage: true,
            error: errorMessage,
          }
        }
      }
    })

    // Mapeamos el productType al nombre de la clave en filePrefixes
    const typeKeyMap: Record<string, string> = {
      RESALE: 'resale',
      PRODUCED_FINAL: 'produced',
      PURCHASED_INGREDIENT: 'ingredient',
      SERVICE: 'service',
    }

    const normalizedKey = typeKeyMap[productType] || 'resale'
    const prefix = langData.filePrefixes[normalizedKey] || 'Kium_Template'

    const fileName = `${prefix}_${Date.now()}.xlsx`
    await workbook.xlsx.writeFile(path.join(this.tempDir, fileName))
    return fileName
  }
}
