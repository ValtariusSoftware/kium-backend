import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIsLockedByPlanToItems1785699331497 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ADD COLUMN "is_locked_by_plan" boolean NOT NULL DEFAULT false
        `)

    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_IS_LOCKED_BY_PLAN" 
            ON "stock_control"."items" ("is_locked_by_plan")
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "stock_control"."IDX_ITEM_IS_LOCKED_BY_PLAN"
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            DROP COLUMN "is_locked_by_plan"
        `)
  }
}
