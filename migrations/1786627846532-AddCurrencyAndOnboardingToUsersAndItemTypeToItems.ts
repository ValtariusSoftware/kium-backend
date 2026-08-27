import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCurrencyAndOnboardingToUsersAndItemTypeToItems1786627846532 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear el ENUM para ItemType en Postgres (si no existe)
    await queryRunner.query(`
          CREATE TYPE "stock_control"."itemtype_enum" AS ENUM('PRODUCT', 'SERVICE');
        `)

    // 2. Agregar columnas a la tabla users
    await queryRunner.query(`
          ALTER TABLE "stock_control"."users" 
          ADD COLUMN "currency" character varying(3) NOT NULL DEFAULT 'USD',
          ADD COLUMN "onboarding_completed" boolean NOT NULL DEFAULT true;
        `)

    // 3. Agregar columna item_type a la tabla items
    await queryRunner.query(`
          ALTER TABLE "stock_control"."items" 
          ADD COLUMN "item_type" "stock_control"."itemtype_enum" NOT NULL DEFAULT 'PRODUCT';
        `)

    // 4. Crear índice opcional para optimizar búsquedas por tipo de ítem
    await queryRunner.query(`
          CREATE INDEX "IDX_ITEM_TYPE" ON "stock_control"."items" ("item_type");
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback en orden inverso
    await queryRunner.query(`
          DROP INDEX "stock_control"."IDX_ITEM_TYPE";
        `)

    await queryRunner.query(`
          ALTER TABLE "stock_control"."items" 
          DROP COLUMN "item_type";
        `)

    await queryRunner.query(`
          ALTER TABLE "stock_control"."users" 
          DROP COLUMN "onboarding_completed",
          DROP COLUMN "currency";
        `)

    await queryRunner.query(`
          DROP TYPE "stock_control"."itemtype_enum";
        `)
  }
}
