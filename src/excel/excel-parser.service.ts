import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import { UNIT_DICTIONARY } from 'src/common/i18n/base-unit.translations'
import { BaseUnit } from 'src/items/entities/item.entity'
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
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(buffer) as any)

    const sheet = workbook.getWorksheet(1)
    if (!sheet) throw new Error('El archivo Excel no tiene hojas válidas')

    const items: CreateItemInput[] = []
    const errors: BulkItemError[] = []

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return

      try {
        const name = row.getCell(1).value?.toString()
        if (!name || name.trim() === '')
          throw new Error(ItemErrorCode.NAME_EMPTY)

        // Validación de números
        const costRaw = row.getCell(3).value
        const costPrice =
          costRaw !== null && costRaw !== undefined && costRaw !== ''
            ? Number(costRaw)
            : 0
        if (isNaN(costPrice)) throw new Error(ItemErrorCode.INVALID_COST_PRICE)

        const saleRaw = row.getCell(4).value
        const salePrice =
          saleRaw !== null && saleRaw !== undefined && saleRaw !== ''
            ? Number(saleRaw)
            : 0
        if (isNaN(salePrice)) throw new Error(ItemErrorCode.INVALID_SALE_PRICE)

        const conversion = Number(row.getCell(6).value || 1)
        if (isNaN(conversion) || conversion <= 0)
          throw new Error(ItemErrorCode.INVALID_CONVERSION)

        // Mapeos
        const unitLabel = row.getCell(5).value?.toString() || ''
        const typeLabel = row.getCell(2).value?.toString() || ''

        items.push({
          name: name,
          productType: this.findProductTypeKey(typeLabel),
          costPrice: costPrice,
          salePrice: salePrice,
          baseUnit: this.findBaseUnitKey(unitLabel),
          conversionToBaseQty: conversion,
          stock: Number(row.getCell(7).value || 0),
          minStockAlert: Number(row.getCell(8).value || 0),
          sku: row.getCell(9).value?.toString()?.trim() || undefined,
          barcode: row.getCell(10).value?.toString()?.trim() || undefined,
          isInitialized: Number(row.getCell(7).value || 0) > 0,
        })
      } catch (e: any) {
        errors.push({
          row: rowNumber,
          name: row.getCell(1).value?.toString() || 'Sin nombre',
          error: e.message,
        })
      }
    })

    return { items, errors }
  }
}
