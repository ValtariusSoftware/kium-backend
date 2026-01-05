import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateUniqueSku1767641166305 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar columna deleted_at si no existe
    // Usamos SQL puro para evitar conflictos con el estado del objeto Table de TypeORM
    await queryRunner.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_schema='stock_control' 
                    AND table_name='items' 
                    AND column_name='deleted_at'
                ) THEN 
                    ALTER TABLE "stock_control"."items" ADD "deleted_at" timestamp; 
                END IF; 
            END $$;
        `)

    // 2. Manejar el índice de SKU
    // Primero lo borramos por si existe como CONSTRAINT o como INDEX para recrearlo
    // de forma que sea compatible con Soft Delete (opcionalmente) o simplemente
    // para que la migración tome el control.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "stock_control"."UQ_ITEM_SKU_PER_USER"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP CONSTRAINT IF EXISTS "UQ_ITEM_SKU_PER_USER"`,
    )

    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_ITEM_SKU_PER_USER" 
            ON "stock_control"."items" ("user_id", "sku") 
            WHERE "deleted_at" IS NULL
        `)

    // 3. Manejar el índice de BARCODE
    await queryRunner.query(
      `DROP INDEX IF EXISTS "stock_control"."UQ_ITEM_BARCODE_PER_USER"`,
    )

    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_ITEM_BARCODE_PER_USER" 
            ON "stock_control"."items" ("user_id", "barcode") 
            WHERE ("barcode" IS NOT NULL AND "deleted_at" IS NULL)
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir a la situación del DDL original (sin considerar deleted_at)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "stock_control"."UQ_ITEM_SKU_PER_USER"`,
    )
    await queryRunner.query(
      `DROP INDEX IF EXISTS "stock_control"."UQ_ITEM_BARCODE_PER_USER"`,
    )

    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_ITEM_SKU_PER_USER" ON stock_control.items (user_id, sku)
        `)
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_ITEM_BARCODE_PER_USER" ON stock_control.items (user_id, barcode) WHERE (barcode IS NOT NULL)
        `)

    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN IF EXISTS "deleted_at"`,
    )
  }
}
