import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddIsInitializedToItems1776104785056 implements MigrationInterface {
  // Nota: El número del nombre de la clase debe coincidir con el del archivo generado

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Creamos la columna
    await queryRunner.addColumn(
      'stock_control.items',
      new TableColumn({
        name: 'is_initialized',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    )

    // 2. Lógica de "Curación": Marcamos como inicializados los que ya tienen stock
    // para que no aparezcan como "vírgenes" si ya tenían mercadería.
    await queryRunner.query(`
            UPDATE stock_control.items 
            SET is_initialized = true 
            WHERE stock > 0
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('stock_control.items', 'is_initialized')
  }
}
