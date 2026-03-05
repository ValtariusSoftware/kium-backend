import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPurchaseUnitToItems1772047040098 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ADD "purchase_unit" "stock_control"."items_base_unit_enum"
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            DROP COLUMN "purchase_unit"
        `)
  }
}
