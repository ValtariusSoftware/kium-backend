import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncAllNumericPrecisions1767562043982 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Corregir Transacciones de Inventario
    await queryRunner.query(`
            ALTER TABLE "stock_control"."inventory_transactions" 
            ALTER COLUMN "unit_cost_snapshot" TYPE numeric(12,2),
            ALTER COLUMN "sale_price_snapshot" TYPE numeric(12,2),
            ALTER COLUMN "quantity" TYPE numeric(12,4);
        `)

    // 2. Corregir Recetas
    await queryRunner.query(`
            ALTER TABLE "stock_control"."recipes" 
            ALTER COLUMN "yield_quantity" TYPE numeric(12,4);
        `)

    // 3. Corregir Ingredientes de Recetas (Corregido nombre a quantity_required)
    await queryRunner.query(`
            ALTER TABLE "stock_control"."recipe_ingredients" 
            ALTER COLUMN "quantity_required" TYPE numeric(12,4);
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."inventory_transactions" 
            ALTER COLUMN "unit_cost_snapshot" TYPE numeric(10,4),
            ALTER COLUMN "sale_price_snapshot" TYPE numeric(10,4),
            ALTER COLUMN "quantity" TYPE numeric(12,4);
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."recipes" 
            ALTER COLUMN "yield_quantity" TYPE numeric(10,4);
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."recipe_ingredients" 
            ALTER COLUMN "quantity_required" TYPE numeric(10,4);
        `)
  }
}
