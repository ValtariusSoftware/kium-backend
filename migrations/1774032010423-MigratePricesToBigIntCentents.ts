import { MigrationInterface, QueryRunner } from 'typeorm'

export class MigratePricesToBigIntCentents1774032010423 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Convertimos los precios de la tabla ITEMS
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "cost_price" TYPE BIGINT USING ("cost_price" * 100)::BIGINT,
            ALTER COLUMN "sale_price" TYPE BIGINT USING ("sale_price" * 100)::BIGINT
        `)

    // 2. Convertimos los snapshots de INVENTORY_TRANSACTIONS
    await queryRunner.query(`
            ALTER TABLE "stock_control"."inventory_transactions" 
            ALTER COLUMN "unit_cost_snapshot" TYPE BIGINT USING ("unit_cost_snapshot" * 100)::BIGINT,
            ALTER COLUMN "sale_price_snapshot" TYPE BIGINT USING ("sale_price_snapshot" * 100)::BIGINT
        `)

    // 3. Convertimos el total de SALES
    await queryRunner.query(`
            ALTER TABLE "stock_control"."sales" 
            ALTER COLUMN "total_amount" TYPE BIGINT USING ("total_amount" * 100)::BIGINT
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertimos: Dividimos por 100 y volvemos a NUMERIC(12,2)
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "cost_price" TYPE NUMERIC(12,2) USING ("cost_price"::NUMERIC / 100),
            ALTER COLUMN "sale_price" TYPE NUMERIC(12,2) USING ("sale_price"::NUMERIC / 100)
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."inventory_transactions" 
            ALTER COLUMN "unit_cost_snapshot" TYPE NUMERIC(12,2) USING ("unit_cost_snapshot"::NUMERIC / 100),
            ALTER COLUMN "sale_price_snapshot" TYPE NUMERIC(12,2) USING ("sale_price_snapshot"::NUMERIC / 100)
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."sales" 
            ALTER COLUMN "total_amount" TYPE NUMERIC(12,2) USING ("total_amount"::NUMERIC / 100)
        `)
  }
}
