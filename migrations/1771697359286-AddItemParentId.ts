import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm'

export class AddItemParentId1771697359286 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregamos la columna parent_id
    await queryRunner.addColumn(
      'stock_control.items',
      new TableColumn({
        name: 'parent_id',
        type: 'uuid',
        isNullable: true, // Debe ser nullable porque los ítems "originales" no tienen padre
      }),
    )

    // 2. Agregamos la Foreign Key para mantener la integridad referencial
    await queryRunner.createForeignKey(
      'stock_control.items',
      new TableForeignKey({
        name: 'FK_item_parent_id',
        columnNames: ['parent_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'stock_control.items',
        onDelete: 'SET NULL', // Si se borra el padre (borrado físico), el hijo queda huérfano pero no explota
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Para revertir, primero quitamos la FK y luego la columna
    await queryRunner.dropForeignKey('stock_control.items', 'FK_item_parent_id')
    await queryRunner.dropColumn('stock_control.items', 'parent_id')
  }
}
