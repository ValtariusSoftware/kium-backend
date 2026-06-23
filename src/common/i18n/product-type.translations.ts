import { ProductType } from 'src/items/enums/product-type'

export const TYPE_DICTIONARY: Record<ProductType, Record<string, string>> = {
  [ProductType.RESALE]: {
    en: 'Resale',
    es: 'Reventa',
    de: 'Wiederverkauf',
    fr: 'Revente',
    it: 'Rivendita',
    pt: 'Revenda',
  },
  [ProductType.PURCHASED_INGREDIENT]: {
    en: 'Purchased Ingredient',
    es: 'Insumo Comprado',
    de: 'Gekaufte Zutat',
    fr: 'Ingrédient acheté',
    it: 'Ingrediente acquistato',
    pt: 'Insumo comprado',
  },
  [ProductType.PRODUCED_FINAL]: {
    en: 'Produced Final',
    es: 'Producto Fabricado',
    de: 'Hergestelltes Produkt',
    fr: 'Produit fini',
    it: 'Prodotto finito',
    pt: 'Produto fabricado',
  },
  [ProductType.PRODUCED_INGREDIENT]: {
    en: 'Produced Ingredient',
    es: 'Insumo Producido',
    de: 'Hergestellte Zutat',
    fr: 'Ingrédient produit',
    it: 'Ingrediente prodotto',
    pt: 'Insumo produzido',
  },
  [ProductType.HYBRID]: {
    en: 'Ingredient & Resale',
    es: 'Insumo y Reventa',
    de: 'Zutat & Wiederverkauf',
    fr: 'Ingrédient & Revente',
    it: 'Ingrediente & Rivendita',
    pt: 'Insumo & Revenda',
  },
}
