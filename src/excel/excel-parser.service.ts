import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import { UNIT_DICTIONARY } from 'src/common/i18n/base-unit.translations'
import { BaseUnit, ItemType } from 'src/items/entities/item.entity'
import { BulkItemError, CreateItemInput } from 'src/items/dto/create-item.dto'
import { ProductType } from 'src/items/enums/product-type'
import { TYPE_DICTIONARY } from 'src/common/i18n/product-type.translations'
import { ItemErrorCode } from 'src/items/enums/item-error-code.enum'

@Injectable()
export class ExcelParserService {
  private findBaseUnitKey(label: string): BaseUnit {
    // Usamos .find() sin desestructurar la clave si no la necesitamos
    const entry = Object.entries(UNIT_DICTIONARY).find(([, trans]) =>
      Object.values(trans).some((t) => t.toLowerCase() === label.toLowerCase()),
    )
    return entry ? (entry[0] as BaseUnit) : BaseUnit.UNIT
  }

  private findProductTypeKey(label: string): ProductType {
    // Nota la coma antes de 'trans': ignora el primer elemento (la clave) explícitamente
    const entry = Object.entries(TYPE_DICTIONARY).find(([, trans]) =>
      Object.values(trans).some((t) => t.toLowerCase() === label.toLowerCase()),
    )
    return entry ? (entry[0] as ProductType) : ProductType.RESALE
  }

  async parse(
    buffer: Buffer,
  ): Promise<{ items: CreateItemInput[]; errors: BulkItemError[] }> {
    // Validación de tamaño: 5MB máximo
    const MAX_SIZE = 5 * 1024 * 1024
    if (buffer.length > MAX_SIZE) {
      throw new Error(ItemErrorCode.FILE_TOO_LARGE)
    }

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(buffer) as any)

    const sheet = workbook.getWorksheet(1)
    console.log('Sheet found:', !!sheet) // LOG PURO

    if (!sheet) throw new Error(ItemErrorCode.INVALID_FILE)
    console.log(
      `LOG_DEBUG: Total de filas detectadas por ExcelJS: ${sheet.rowCount}`,
    )

    // Usamos rowCount para saber hasta dónde llegar
    const totalRows = sheet.rowCount
    console.log(
      `LOG_DEBUG: Total de filas detectadas por ExcelJS: ${totalRows}`,
    )

    const items: CreateItemInput[] = []
    const errors: BulkItemError[] = []

    // Reemplazamos sheet.eachRow por un bucle for que garantice la lectura
    console.log(`LOG_DEBUG: Intentando leer manualmente hasta la fila 10...`)

    // Iteramos desde la fila 2 hasta el total de filas que tenga datos
    for (let rowNumber = 2; rowNumber <= totalRows; rowNumber++) {
      const row = sheet.getRow(rowNumber)

      // Verificación rápida: si toda la fila está vacía, la saltamos
      // Esto evita procesar miles de filas vacías al final del Excel
      const rowValues = row.values as any[]
      if (!rowValues || rowValues.every((v) => v === undefined || v === null)) {
        continue
      }

      // LOG de diagnóstico
      console.log(
        `LOG_DEBUG: Procesando fila ${rowNumber}, Celda 1 bruta: "${row.getCell(1).value}"`,
      )

      try {
        // Obtenemos el nombre una sola vez aquí adentro
        const rawName = row.getCell(1).value
        const name = rawName ? rawName.toString().trim() : ''

        if (!name) {
          console.log(`LOG_DEBUG: Fila ${rowNumber} ignorada por nombre vacío`)
          continue // Salta a la siguiente iteración del for
        }
        if (!name || name.trim() === '')
          throw new Error(ItemErrorCode.NAME_EMPTY)

        // Validación de números
        // const costRaw = row.getCell(3).value
        // const costPrice =
        //   costRaw !== null && costRaw !== undefined && costRaw !== ''
        //     ? Number(costRaw)
        //     : 0
        // if (isNaN(costPrice)) throw new Error(ItemErrorCode.INVALID_COST_PRICE)

        // const saleRaw = row.getCell(4).value
        // const salePrice =
        //   saleRaw !== null && saleRaw !== undefined && saleRaw !== ''
        //     ? Number(saleRaw)
        //     : 0
        // if (isNaN(salePrice)) throw new Error(ItemErrorCode.INVALID_SALE_PRICE)

        // const conversion = Number(row.getCell(6).value || 1)
        // if (isNaN(conversion) || conversion <= 0)
        //   throw new Error(ItemErrorCode.INVALID_CONVERSION)

        const costRaw = row.getCell(2).value
        const costPrice =
          costRaw !== null && costRaw !== undefined && costRaw !== ''
            ? Number(costRaw)
            : 0
        if (isNaN(costPrice)) throw new Error(ItemErrorCode.INVALID_COST_PRICE)

        const saleRaw = row.getCell(3).value
        const salePrice =
          saleRaw !== null && saleRaw !== undefined && saleRaw !== ''
            ? Number(saleRaw)
            : 0
        if (isNaN(salePrice)) throw new Error(ItemErrorCode.INVALID_SALE_PRICE)

        // Mapeos
        // const unitLabel = row.getCell(5).value?.toString() || ''
        // const typeLabel = row.getCell(2).value?.toString() || ''

        items.push({
          name: name,
          // productType: this.findProductTypeKey(typeLabel),
          productType: ProductType.RESALE, // <--- Hardcodealo acá, sin leer el Excel
          itemType: ItemType.PRODUCT,
          costPrice: costPrice * 100,
          salePrice: salePrice * 100,
          // baseUnit: this.findBaseUnitKey(unitLabel),
          // conversionToBaseQty: conversion,
          baseUnit: BaseUnit.UNIT, // <--- Hardcodealo acá, sin leer el Excel
          conversionToBaseQty: 1, // <--- Hardcodealo acá, sin leer el Excel
          // stock: Number(row.getCell(7).value || 0),
          // minStockAlert: Number(row.getCell(8).value || 0),
          // sku: row.getCell(9).value?.toString()?.trim() || undefined,
          // barcode: row.getCell(10).value?.toString()?.trim() || undefined,
          // isInitialized: Number(row.getCell(7).value || 0) > 0,

          // AHORA TENÉS QUE APUNTAR A LA COLUMNA DONDE REALMENTE ESTÁN LOS DATOS
          stock: Number(row.getCell(4).value || 0), // Ejemplo: Si Stock estaba en la 7, ahora es la 4
          minStockAlert: Number(row.getCell(5).value || 0),
          sku: row.getCell(6).value?.toString()?.trim() || undefined,
          barcode: row.getCell(7).value?.toString()?.trim() || undefined,
          isInitialized: Number(row.getCell(4).value || 0) > 0,
        })
      } catch (e: any) {
        console.error(`LOG_DEBUG: ERROR FATAL EN FILA ${rowNumber}:`, e.message)
        errors.push({
          row: rowNumber,
          name: row.getCell(1).value?.toString() || 'Sin nombre',
          error: e.message,
        })
      }
    }

    return { items, errors }
  }
}
