import { Injectable } from '@nestjs/common'
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

  async generate(
    columns: ColumnConfig[],
    lang: string = 'en',
  ): Promise<string> {
    // 1. Selección de idioma
    const langData = I18N_EXCEL[lang] || I18N_EXCEL['en']
    // 1. Limpieza preventiva (Autolimpieza)
    await this.cleanupTempFiles()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(langData.sheetName)

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

    const fileName = `${langData.filePrefix}_${Date.now()}.xlsx`
    await workbook.xlsx.writeFile(path.join(this.tempDir, fileName))
    return fileName
  }
}
