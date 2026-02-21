import { registerEnumType } from '@nestjs/graphql'

// inventory-transactions/enums/transaction-type.enum.ts
export enum TransactionType {
  // Entradas (Aumentan el stock)
  INITIAL_INVENTORY = 'INITIAL_INVENTORY', // Stock inicial al crear el ítem
  MEASUREMENT_ADJUSTMENT = 'MEASUREMENT_ADJUSTMENT',
  PURCHASE = 'PURCHASE', // Compra a proveedor
  PRODUCTION_IN = 'PRODUCTION_IN', // Entrada de producto final fabricado
  ADJUSTMENT_IN = 'ADJUSTMENT_IN', // Corrección o hallazgo de stock

  // Salidas (Disminuyen el stock)
  SALE = 'SALE', // Venta a cliente
  CONSUMPTION = 'CONSUMPTION', // Uso de ingrediente en una receta (materia prima)
  PRODUCTION_OUT = 'PRODUCTION_OUT', // Salida de materia prima usada en producción
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT', // Pérdida, robo, daño, ajuste negativo
  RETURN_FROM_SALE = 'RETURN_FROM_SALE', // Devolución de venta o anulación
}

// 💡 REGISTRAR PARA GRAPHQL
registerEnumType(TransactionType, {
  name: 'TransactionType', // Este nombre debe coincidir con el que usas en @Field()
  description: 'Tipos de movimientos de inventario soportados por el sistema.',
})
