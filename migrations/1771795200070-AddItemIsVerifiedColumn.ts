import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddItemIsVerifiedColumn1771795200070 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'stock_control.items',
      new TableColumn({
        name: 'is_verified',
        type: 'boolean',
        isNullable: false,
        default: true, // Por defecto true para no afectar ítems viejos
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('stock_control.items', 'is_verified')
  }
}
