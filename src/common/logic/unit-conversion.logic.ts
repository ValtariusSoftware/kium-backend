import { BaseUnit } from 'src/items/entities/item.entity'

export const UNIT_CONVERSION_FACTORS: Record<string, Record<string, number>> = {
  // MASA
  [BaseUnit.GRAM]: { [BaseUnit.KILOGRAM]: 1000 },
  [BaseUnit.MILLIGRAM]: { [BaseUnit.KILOGRAM]: 1000000, [BaseUnit.GRAM]: 1000 },
  [BaseUnit.OUNCE]: { [BaseUnit.POUND]: 16 },

  // VOLUMEN
  [BaseUnit.MILLILITER]: { [BaseUnit.LITER]: 1000 },
  [BaseUnit.FL_OUNCE]: { [BaseUnit.GALLON]: 128 },

  // LONGITUD
  [BaseUnit.MILLIMETER]: { [BaseUnit.METER]: 1000, [BaseUnit.CENTIMETER]: 10 },
  [BaseUnit.CENTIMETER]: { [BaseUnit.METER]: 100 },
  [BaseUnit.INCH]: { [BaseUnit.FOOT]: 12 },
}

/**
 * Retorna el factor por el cual dividir la cantidad solicitada
 * para obtener la cantidad en la unidad base.
 */
export function getUnitConversionFactor(
  fromUnit: BaseUnit,
  toBaseUnit: BaseUnit,
): number {
  if (fromUnit === toBaseUnit) return 1

  // 1. Intentar conversión directa (ej: GRAM -> KILOGRAM)
  const directFactor = UNIT_CONVERSION_FACTORS[fromUnit]?.[toBaseUnit]
  if (directFactor) return directFactor

  // 2. Intentar conversión inversa (ej: KILOGRAM -> GRAM)
  const inverseFactor = UNIT_CONVERSION_FACTORS[toBaseUnit]?.[fromUnit]
  if (inverseFactor) return 1 / inverseFactor

  // 3. Si no hay conversión (ej: KILOGRAM -> LITER),
  // confiamos en el factor manual que el usuario definió al crear el ítem.
  return 1
}
