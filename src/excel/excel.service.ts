import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as path from 'path'
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
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir)
  }

  async generate(
    columns: ColumnConfig[],
    lang: string = 'en',
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Productos')

    // Obtenemos el mensaje de error según el idioma recibido
    const errorMessage = VALIDATION_MESSAGES[lang] || VALIDATION_MESSAGES['en']

    sheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width || 20,
    }))

    columns.forEach((col, index) => {
      if (col.dropdown) {
        const colNumber = index + 1

        // 1. Esto es lo que el usuario ve en el Dropdown
        const labels = col.dropdown.options.map((opt) => opt.label)

        // 2. Aplicamos la validación con las ETIQUETAS (lo que ve el usuario)
        for (let row = 2; row <= 3000; row++) {
          const cell = sheet.getCell(row, colNumber)

          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            // AQUÍ PASAMOS LAS ETIQUETAS PARA QUE EL DROPDOWN SEA AMIGABLE
            formulae: [`"${labels.join(',')}"`],
            showErrorMessage: true,
            error: errorMessage,
          }
        }
      }
    })

    const fileName = `template_${Date.now()}.xlsx`
    await workbook.xlsx.writeFile(path.join(this.tempDir, fileName))
    return fileName
  }
}
