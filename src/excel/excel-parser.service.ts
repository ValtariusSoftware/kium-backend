import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import { UNIT_DICTIONARY } from 'src/common/i18n/base-unit.translations'
import { EXCEL_HEADERS, I18N_EXCEL } from 'src/common/i18n/excel-headers'
import { BaseUnit, ItemType } from 'src/items/entities/item.entity'
import { BulkItemError, CreateItemInput } from 'src/items/dto/create-item.dto'
import { ProductType } from 'src/items/enums/product-type'
import { ItemErrorCode } from 'src/items/enums/item-error-code.enum'

@Injectable()
export class ExcelParserService {
  private findBaseUnitKey(label: string): BaseUnit {
    const entry = Object.entries(UNIT_DICTIONARY).find(([, trans]) =>
      Object.values(trans).some((t) => t.toLowerCase() === label.toLowerCase()),
    )
    return entry ? (entry[0] as BaseUnit) : BaseUnit.UNIT
  }

  private isDirectMode(value: any): boolean {
    if (!value) return true

    const cellValue = value.toString().trim().toLowerCase()
    const directLabels = [
      ...Object.values(EXCEL_HEADERS.saleDirect || {}),
      ...Object.values(EXCEL_HEADERS.useDirect || {}),
    ]

    return directLabels.some((trans) => trans.toLowerCase() === cellValue)
  }

  /**
   * Lee dinámicamente el tipo de plantilla analizando el nombre del archivo subido
   * contra los prefijos configurados en todos los idiomas de I18N_EXCEL.
   */
  private detectTemplateType(fileName: string): ProductType | 'SERVICE' {
    const lowerName = fileName.toLowerCase()

    for (const langConfig of Object.values(I18N_EXCEL)) {
      const prefixes = langConfig.filePrefixes

      if (lowerName.includes(prefixes.ingredient.toLowerCase())) {
        return ProductType.PURCHASED_INGREDIENT
      }
      if (lowerName.includes(prefixes.produced.toLowerCase())) {
        return ProductType.PRODUCED_FINAL
      }
      if (lowerName.includes(prefixes.service.toLowerCase())) {
        return 'SERVICE' as any
      }
      if (lowerName.includes(prefixes.resale.toLowerCase())) {
        return ProductType.RESALE
      }
    }

    throw new Error(ItemErrorCode.INVALID_TEMPLATE)
  }

  /**
   * Lee la fila 1 del Excel y mapea cada clave interna con el índice de su columna correspondiente,
   * permitiendo que las columnas se muevan de lugar o cambien de idioma sin romper el sistema.
   */
  private buildColumnMap(headerRow: ExcelJS.Row): Record<string, number> {
    const map: Record<string, number> = {}

    headerRow.eachCell((cell, colNumber) => {
      const cellValue = cell.value?.toString().trim().toLowerCase()
      if (!cellValue) return

      for (const [key, translations] of Object.entries(EXCEL_HEADERS)) {
        const matches = Object.values(translations).some(
          (t) => t.toLowerCase() === cellValue,
        )
        if (matches) {
          map[key] = colNumber
          break
        }
      }
    })

    return map
  }

  async parse(
    buffer: Buffer,
    fileName: string,
    expectedType?: string,
  ): Promise<{ items: CreateItemInput[]; errors: BulkItemError[] }> {
    const MAX_SIZE = 5 * 1024 * 1024
    if (buffer.length > MAX_SIZE) {
      throw new Error(ItemErrorCode.FILE_TOO_LARGE)
    }

    const productType = this.detectTemplateType(fileName)
    console.log(
      'LOG_DEBUG: Nombre de archivo ->',
      fileName,
      '| Tipo detectado ->',
      productType,
    )

    // --- VALIDACIÓN DE CRUZAMIENTO DE PLANILLAS ---
    if (expectedType) {
      const isServiceTemplate = productType === 'SERVICE'
      const isExpectedService = expectedType === 'SERVICE'

      // Si el drawer es de servicios pero mandaron una planilla de productos
      if (isExpectedService && !isServiceTemplate) {
        throw new Error(ItemErrorCode.INVALID_TEMPLATE) // O un código específico como 'INVALID_TEMPLATE_FOR_SERVICES'
      }

      // Si el drawer es de productos pero mandaron una planilla de servicios
      if (!isExpectedService && isServiceTemplate) {
        throw new Error(ItemErrorCode.INVALID_TEMPLATE) // O un código específico como 'INVALID_TEMPLATE_FOR_PRODUCTS'
      }
    }
    // ---------------------------------------------

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(buffer) as any)

    const sheet = workbook.getWorksheet(1)
    if (!sheet) throw new Error(ItemErrorCode.INVALID_FILE)

    const headerRow = sheet.getRow(1)
    const columnMap = this.buildColumnMap(headerRow)

    const totalRows = sheet.rowCount
    const items: CreateItemInput[] = []
    const errors: BulkItemError[] = []

    for (let rowNumber = 2; rowNumber <= totalRows; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      const rowValues = row.values as any[]
      if (!rowValues || rowValues.every((v) => v === undefined || v === null)) {
        continue
      }

      try {
        const nameCol = columnMap['name'] || columnMap['serviceName'] || 1
        const rawName = row.getCell(nameCol).value
        const name = rawName ? rawName.toString().trim() : ''

        if (!name) continue
        if (name === '') throw new Error(ItemErrorCode.NAME_EMPTY)

        const itemData = this.extractItemByMap(row, productType, columnMap)
        items.push(itemData)
      } catch (e: any) {
        errors.push({
          row: rowNumber,
          name: 'Sin nombre',
          error: e.message,
        })
      }
    }

    return { items, errors }
  }

  private extractItemByMap(
    row: ExcelJS.Row,
    productType: ProductType | 'SERVICE',
    col: Record<string, number>,
  ): CreateItemInput {
    const nameCol = col['name'] || col['serviceName'] || 1
    const nameCell = row.getCell(nameCol).value
    if (!nameCell) throw new Error(ItemErrorCode.NAME_EMPTY)
    const name = nameCell.toString().trim()

    const getVal = (key: string) =>
      col[key] ? row.getCell(col[key]).value : undefined

    switch (productType) {
      case ProductType.PURCHASED_INGREDIENT: {
        const costPrice = Number(getVal('costPrice') || 0)
        if (isNaN(costPrice)) throw new Error(ItemErrorCode.INVALID_COST_PRICE)

        const modeVal = getVal('useMode')
        const isDirect = this.isDirectMode(modeVal)

        let baseUnit = BaseUnit.UNIT
        let conversion = 1

        if (!isDirect) {
          const unitLabel = getVal('baseUnit') || getVal('useUnit') || ''
          conversion = Number(
            getVal('conversion') || getVal('producedConversion') || 1,
          )
          if (isNaN(conversion) || conversion <= 0)
            throw new Error(ItemErrorCode.INVALID_CONVERSION)

          baseUnit = unitLabel
            ? this.findBaseUnitKey(unitLabel.toString())
            : BaseUnit.UNIT
        }

        const stock = Number(getVal('initialStock') || 0)
        const sku = getVal('sku')?.toString()?.trim() || undefined

        return {
          name,
          productType: ProductType.PURCHASED_INGREDIENT,
          itemType: ItemType.PRODUCT,
          costPrice: costPrice * 100,
          salePrice: 0,
          baseUnit,
          conversionToBaseQty: conversion,
          stock,
          minStockAlert: 0,
          sku,
          isInitialized: stock > 0,
        }
      }

      case ProductType.PRODUCED_FINAL: {
        const modeVal = getVal('saleMode')
        const isDirect = this.isDirectMode(modeVal)

        let baseUnit = BaseUnit.UNIT
        let conversion = 1

        if (!isDirect) {
          const unitLabel = getVal('baseUnit') || ''
          conversion = Number(
            getVal('producedConversion') || getVal('conversion') || 1,
          )
          if (isNaN(conversion) || conversion <= 0)
            throw new Error(ItemErrorCode.INVALID_CONVERSION)

          baseUnit = unitLabel
            ? this.findBaseUnitKey(unitLabel.toString())
            : BaseUnit.UNIT
        }

        const sku = getVal('sku')?.toString()?.trim() || undefined
        const barcode = getVal('barcode')?.toString()?.trim() || undefined

        return {
          name,
          productType: ProductType.PRODUCED_FINAL,
          itemType: ItemType.PRODUCT,
          costPrice: 0,
          salePrice: 0,
          baseUnit,
          conversionToBaseQty: conversion,
          stock: 0,
          minStockAlert: 0,
          sku,
          barcode,
          isInitialized: false,
        }
      }

      case 'SERVICE': {
        const costPrice = Number(getVal('costPrice') || 0)
        if (isNaN(costPrice)) throw new Error(ItemErrorCode.INVALID_COST_PRICE)

        const salePrice = Number(getVal('salePrice') || 0)
        if (isNaN(salePrice)) throw new Error(ItemErrorCode.INVALID_SALE_PRICE)

        const sku = getVal('sku')?.toString()?.trim() || undefined

        return {
          name,
          productType: 'SERVICE' as any,
          itemType: ItemType.SERVICE,
          costPrice: costPrice * 100,
          salePrice: salePrice * 100,
          baseUnit: BaseUnit.UNIT,
          conversionToBaseQty: 1,
          stock: 0,
          minStockAlert: 0,
          sku,
          isInitialized: false,
        }
      }

      case ProductType.RESALE: {
        const costPrice = Number(getVal('costPrice') || 0)
        if (isNaN(costPrice)) throw new Error(ItemErrorCode.INVALID_COST_PRICE)

        const salePrice = Number(getVal('salePrice') || 0)
        if (isNaN(salePrice)) throw new Error(ItemErrorCode.INVALID_SALE_PRICE)

        const stock = Number(getVal('initialStock') || 0)
        const minStockAlert = Number(getVal('stockAlert') || 0)

        const modeVal = getVal('saleMode')
        const isDirect = this.isDirectMode(modeVal)

        let baseUnit = BaseUnit.UNIT
        let conversion = 1

        if (!isDirect) {
          const unitLabel = getVal('baseUnit') || ''
          conversion = Number(getVal('conversion') || 1)
          if (isNaN(conversion) || conversion <= 0)
            throw new Error(ItemErrorCode.INVALID_CONVERSION)

          baseUnit = unitLabel
            ? this.findBaseUnitKey(unitLabel.toString())
            : BaseUnit.UNIT
        }

        const sku = getVal('sku')?.toString()?.trim() || undefined
        const barcode = getVal('barcode')?.toString()?.trim() || undefined

        return {
          name,
          productType: ProductType.RESALE,
          itemType: ItemType.PRODUCT,
          costPrice: costPrice * 100,
          salePrice: salePrice * 100,
          baseUnit,
          conversionToBaseQty: conversion,
          stock,
          minStockAlert,
          sku,
          barcode,
          isInitialized: stock > 0,
        }
      }

      default:
        throw new Error(ItemErrorCode.INVALID_TEMPLATE)
    }
  }
}
