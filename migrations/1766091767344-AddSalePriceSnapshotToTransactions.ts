import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddSalePriceSnapshotToTransactions1766091767344 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'stock_control.inventory_transactions',
      new TableColumn({
        name: 'sale_price_snapshot',
        type: 'decimal',
        precision: 10,
        scale: 4,
        isNullable: true, // Es null para compras o ajustes, solo obligatorio en SALE
        default: 0,
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(
      'stock_control.inventory_transactions',
      'sale_price_snapshot',
    )
  }
}
