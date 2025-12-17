import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

const SCHEMA_NAME = 'stock_control'
const ITEMS_TABLE_NAME = 'items'

export class RemoveUnitOfStockName1765894987502 implements MigrationInterface {
  name = 'RemoveUnitOfStockName1765894987502'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(
      `${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`,
    )

    // Verificamos si la columna existe antes de intentar eliminarla
    if (table?.columns.find((column) => column.name === 'unit_of_stock_name')) {
      await queryRunner.dropColumn(
        `${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`,
        'unit_of_stock_name',
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar unit_of_stock_name.
    // Usamos 'Unidad' como valor por defecto y 'varchar' con un límite para la reversión.
    await queryRunner.addColumn(
      `${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`,
      new TableColumn({
        name: 'unit_of_stock_name',
        type: 'varchar',
        length: '50', // Definimos una longitud adecuada
        isNullable: false,
        default: "'Unidad'", // Importante: usar comillas simples para el valor string en el default
      }),
    )
  }
}
