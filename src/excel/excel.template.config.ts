import { EXCEL_HEADERS } from 'src/common/i18n/excel-headers'
import { ColumnConfig } from './interfaces/excel-config.interface'
import { UNIT_DICTIONARY } from 'src/common/i18n/base-unit.translations'
import { TYPE_DICTIONARY } from 'src/common/i18n/product-type.translations'

// Helper local para evitar el undefined
const getLabel = (obj: any, lang: string, key: string) => {
  const translation = obj[key]?.[lang] || obj[key]?.['en'] || key
  return translation
}

export const getProductTemplateConfig = (lang: string): ColumnConfig[] => [
  { header: getLabel(EXCEL_HEADERS, lang, 'name'), key: 'name' },
  {
    header: getLabel(EXCEL_HEADERS, lang, 'type'),
    key: 'productType',
    dropdown: {
      options: Object.entries(TYPE_DICTIONARY).map(([key, trans]) => ({
        label: trans[lang] || trans['en'],
        value: key,
      })),
    },
  },
  { header: getLabel(EXCEL_HEADERS, lang, 'costPrice'), key: 'costPrice' },
  { header: getLabel(EXCEL_HEADERS, lang, 'salePrice'), key: 'salePrice' },
  {
    header: getLabel(EXCEL_HEADERS, lang, 'baseUnit'),
    key: 'baseUnit',
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
  },
  {
    header: getLabel(EXCEL_HEADERS, lang, 'initialStock'),
    key: 'initialStock',
  },
  { header: getLabel(EXCEL_HEADERS, lang, 'stockAlert'), key: 'stockAlert' },
  { header: getLabel(EXCEL_HEADERS, lang, 'sku'), key: 'sku' },
  { header: getLabel(EXCEL_HEADERS, lang, 'barcode'), key: 'barcode' },
]
