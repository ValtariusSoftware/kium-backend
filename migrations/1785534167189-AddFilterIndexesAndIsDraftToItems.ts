import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddFilterIndexesAndIsDraftToItems1785534167189 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregamos la nueva columna is_draft en el esquema stock_control
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ADD COLUMN "is_draft" boolean NOT NULL DEFAULT false
        `)

    // 2. Creamos los índices para optimizar las consultas de filtrado en el esquema stock_control
    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_IS_SALEABLE" ON "stock_control"."items" ("is_saleable")
        `)

    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_IS_PRODUCED" ON "stock_control"."items" ("is_produced")
        `)

    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_IS_PURCHASABLE" ON "stock_control"."items" ("is_purchasable")
        `)

    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_IS_INGREDIENT" ON "stock_control"."items" ("is_ingredient")
        `)

    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_IS_DRAFT" ON "stock_control"."items" ("is_draft")
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En caso de rollback, eliminamos los índices y la columna en orden inverso
    await queryRunner.query(`DROP INDEX "stock_control"."IDX_ITEM_IS_DRAFT"`)
    await queryRunner.query(
      `DROP INDEX "stock_control"."IDX_ITEM_IS_INGREDIENT"`,
    )
    await queryRunner.query(
      `DROP INDEX "stock_control"."IDX_ITEM_IS_PURCHASABLE"`,
    )
    await queryRunner.query(`DROP INDEX "stock_control"."IDX_ITEM_IS_PRODUCED"`)
    await queryRunner.query(`DROP INDEX "stock_control"."IDX_ITEM_IS_SALEABLE"`)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            DROP COLUMN "is_draft"
        `)
  }
}
