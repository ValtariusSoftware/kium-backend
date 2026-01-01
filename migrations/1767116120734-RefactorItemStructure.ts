import { MigrationInterface, QueryRunner } from 'typeorm'

export class RefactorItemStructure1767116120734 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregamos SKU (Importante para identificar productos)
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "sku" varchar(50)`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ITEM_SKU_PER_USER" ON "stock_control"."items" ("user_id", "sku")`,
    )

    // 2. Agregamos los Flags para inferencia rápida
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "is_saleable" boolean DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "is_produced" boolean DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "is_purchasable" boolean DEFAULT true`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "is_ingredient" boolean DEFAULT false`,
    )

    // 3. Migrar datos existentes basados en el viejo ItemType (para no perder nada)
    await queryRunner.query(
      `UPDATE "stock_control"."items" SET "is_saleable" = true WHERE "type" IN ('FINAL_PRODUCT', 'RESELL_PRODUCT')`,
    )
    await queryRunner.query(
      `UPDATE "stock_control"."items" SET "is_produced" = true WHERE "type" = 'FINAL_PRODUCT'`,
    )
    await queryRunner.query(
      `UPDATE "stock_control"."items" SET "is_ingredient" = true WHERE "type" = 'INGREDIENT'`,
    )

    // 4. Borrar la columna vieja (Opcional, podés comentarlo si querés probar antes de borrar)
    // await queryRunner.query(`ALTER TABLE "stock_control"."items" DROP COLUMN "type"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "is_ingredient"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "is_purchasable"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "is_produced"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "is_saleable"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "sku"`,
    )
  }
}
