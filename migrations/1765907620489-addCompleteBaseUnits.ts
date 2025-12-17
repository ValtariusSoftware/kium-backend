import { MigrationInterface, QueryRunner } from 'typeorm'

// Lista de las nuevas unidades a agregar
const newBaseUnits = [
  'PACK',
  'BOX',
  'ROLL',
  'BAG',
  'PALLET',
  'METER',
  'CENTIMETER',
  'MILLIMETER',
  'FOOT',
  'YARD',
  'SQUARE_METER',
  'GRAM',
  'MILLIGRAM',
  'POUND',
  'OUNCE',
  'MILLILITER',
  'GALLON',
  'FL_OUNCE',
  'CUBIC_METER',
  'HOUR',
  'DAY',
]

// Nombre del tipo ENUM en la base de datos (PostgreSQL), ajustado a tu esquema 'stock_control'
const enumName = 'stock_control.items_base_unit_enum'

export class AddCompleteBaseUnits1765907620489 implements MigrationInterface {
  /**
   * El método 'up' añade los nuevos valores al tipo ENUM existente.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ejecutamos la consulta para cada nueva unidad
    for (const unit of newBaseUnits) {
      // Utilizamos el nombre completo del ENUM con el esquema
      await queryRunner.query(`ALTER TYPE ${enumName} ADD VALUE '${unit}'`)
    }
  }

  /**
   * El método 'down' es vacío por seguridad, ya que eliminar valores de un ENUM
   * en uso en PostgreSQL es una operación destructiva que requiere recrear el tipo.
   */
  public async down(): Promise<void> {
    // Dejamos la reversión vacía por seguridad en producción
    console.log(
      'Revertir la adición de valores a un ENUM es riesgoso en PostgreSQL. Se omite la reversión.',
    )
  }
}
