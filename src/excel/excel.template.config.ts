import { EXCEL_HEADERS } from 'src/common/i18n/excel-headers'
import { ColumnConfig } from './interfaces/excel-config.interface'
import { ProductType } from 'src/items/enums/product-type'
import { UNIT_DICTIONARY } from 'src/common/i18n/base-unit.translations'

const getLabel = (obj: any, lang: string, key: string) => {
  return obj[key]?.[lang] || obj[key]?.['en'] || key
}

export const getProductTemplateConfig = (
  productType: string,
  lang: string,
): ColumnConfig[] => {
  // 1. Configuración de columnas para INSUMOS (PURCHASED_INGREDIENT)
  if (productType === ProductType.PURCHASED_INGREDIENT) {
    return [
      { header: getLabel(EXCEL_HEADERS, lang, 'name'), key: 'name', width: 25 },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'initialStock'),
        key: 'initialStock',
        width: 15,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'stockAlert'),
        key: 'stockAlert',
        width: 15,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'useMode'),
        key: 'useMode',
        width: 25,
        dropdown: {
          options: [
            {
              label: getLabel(EXCEL_HEADERS, lang, 'useDirect'),
              value: 'direct',
            },
            {
              label: getLabel(EXCEL_HEADERS, lang, 'useFractioned'),
              value: 'fractioned',
            },
          ],
        },
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'useUnit'),
        key: 'baseUnit',
        width: 25,
        dropdown: {
          options: Object.entries(UNIT_DICTIONARY).map(([key, trans]) => ({
            label: trans[lang] || trans['en'],
            value: key,
          })),
        },
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'conversion'),
        key: 'conversionFactor',
        width: 35,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'costPrice'),
        key: 'costPrice',
        width: 15,
      },
      { header: getLabel(EXCEL_HEADERS, lang, 'sku'), key: 'sku', width: 20 },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'barcode'),
        key: 'barcode',
        width: 20,
      },
    ]
  }

  // 2. Configuración de columnas para PRODUCTOS ELABORADOS (PRODUCED_FINAL)
  if (productType === ProductType.PRODUCED_FINAL) {
    return [
      { header: getLabel(EXCEL_HEADERS, lang, 'name'), key: 'name', width: 25 },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'saleMode'),
        key: 'saleMode',
        width: 25,
        dropdown: {
          options: [
            {
              label: getLabel(EXCEL_HEADERS, lang, 'saleDirect'),
              value: 'direct',
            },
            {
              label: getLabel(EXCEL_HEADERS, lang, 'saleFractioned'),
              value: 'fractioned',
            },
          ],
        },
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'baseUnit'),
        key: 'baseUnit',
        width: 25,
        dropdown: {
          options: Object.entries(UNIT_DICTIONARY).map(([key, trans]) => ({
            label: trans[lang] || trans['en'],
            value: key,
          })),
        },
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'producedConversion'),
        key: 'conversionFactor',
        width: 40,
      },
      { header: getLabel(EXCEL_HEADERS, lang, 'sku'), key: 'sku', width: 20 },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'barcode'),
        key: 'barcode',
        width: 20,
      },
    ]
  }

  // 3. Configuración de columnas para SERVICIOS (SERVICE)
  if (productType === 'SERVICE') {
    return [
      {
        header: getLabel(EXCEL_HEADERS, lang, 'serviceName'),
        key: 'name',
        width: 25,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'costPrice'),
        key: 'costPrice',
        width: 15,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'salePrice'),
        key: 'salePrice',
        width: 15,
      },
      { header: getLabel(EXCEL_HEADERS, lang, 'sku'), key: 'sku', width: 20 },
    ]
  }

  // 4. Configuración para REVENTA (RESALE)
  if (productType === ProductType.RESALE) {
    return [
      { header: getLabel(EXCEL_HEADERS, lang, 'name'), key: 'name', width: 25 },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'initialStock'),
        key: 'initialStock',
        width: 15,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'stockAlert'),
        key: 'stockAlert',
        width: 15,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'saleMode'),
        key: 'saleMode',
        width: 25,
        dropdown: {
          options: [
            {
              label: getLabel(EXCEL_HEADERS, lang, 'saleDirect'),
              value: 'direct',
            },
            {
              label: getLabel(EXCEL_HEADERS, lang, 'saleFractioned'),
              value: 'fractioned',
            },
          ],
        },
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'baseUnit'),
        key: 'baseUnit',
        width: 25,
        dropdown: {
          options: Object.entries(UNIT_DICTIONARY).map(([key, trans]) => ({
            label: trans[lang] || trans['en'],
            value: key,
          })),
        },
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'conversion'),
        key: 'conversionFactor',
        width: 35,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'costPrice'),
        key: 'costPrice',
        width: 15,
      },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'salePrice'),
        key: 'salePrice',
        width: 15,
      },
      { header: getLabel(EXCEL_HEADERS, lang, 'sku'), key: 'sku', width: 20 },
      {
        header: getLabel(EXCEL_HEADERS, lang, 'barcode'),
        key: 'barcode',
        width: 20,
      },
    ]
  }

  throw new Error('Invalid template configuration type')
}
