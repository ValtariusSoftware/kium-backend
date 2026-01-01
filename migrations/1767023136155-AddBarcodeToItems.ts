import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddBarcodeToItems1767023136155 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar la columna barcode
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "barcode" varchar(100)`,
    )

    // 2. Crear el índice único compuesto
    // Nota: Filtramos "WHERE barcode IS NOT NULL" para permitir múltiples productos sin código
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ITEM_BARCODE_PER_USER" 
       ON "stock_control"."items" ("user_id", "barcode") 
       WHERE "barcode" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminar el índice
    await queryRunner.query(
      `DROP INDEX "stock_control"."UQ_ITEM_BARCODE_PER_USER"`,
    )

    // 2. Eliminar la columna
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "barcode"`,
    )
  }
}
