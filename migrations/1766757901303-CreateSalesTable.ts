import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
} from 'typeorm'

export class CreateSalesTable1766757901303 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear la tabla de Ventas
    await queryRunner.createTable(
      new Table({
        name: 'stock_control.sales',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'total_amount',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
          },
          {
            name: 'user_id',
            type: 'varchar', // Ajustado a varchar(255) como tus otras tablas
            length: '255',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    )

    // 2. Agregar la columna sale_id a la tabla de transacciones
    await queryRunner.addColumn(
      'stock_control.inventory_transactions',
      new TableColumn({
        name: 'sale_id',
        type: 'uuid',
        isNullable: true,
      }),
    )

    // 3. Crear la Foreign Key hacia Sales
    await queryRunner.createForeignKey(
      'stock_control.inventory_transactions',
      new TableForeignKey({
        columnNames: ['sale_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'stock_control.sales',
        onDelete: 'SET NULL',
      }),
    )

    // 4. (Opcional pero recomendado) Foreign Key hacia Users para la tabla Sales
    await queryRunner.createForeignKey(
      'stock_control.sales',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'stock_control.users',
        onDelete: 'CASCADE',
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar FK de transacciones
    const tableTrans = await queryRunner.getTable(
      'stock_control.inventory_transactions',
    )
    const fkSale = tableTrans?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('sale_id') !== -1,
    )
    if (fkSale)
      await queryRunner.dropForeignKey(
        'stock_control.inventory_transactions',
        fkSale,
      )

    await queryRunner.dropColumn(
      'stock_control.inventory_transactions',
      'sale_id',
    )
    await queryRunner.dropTable('stock_control.sales')
  }
}
