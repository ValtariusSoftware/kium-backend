import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddIsVoidedToSales1766758000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'stock_control.sales',
      new TableColumn({
        name: 'is_voided',
        type: 'boolean',
        default: false,
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('stock_control.sales', 'is_voided')
  }
}
