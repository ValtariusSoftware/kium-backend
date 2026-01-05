import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateItemDecimalPrecision1767560804571 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Modificamos las columnas al nuevo estándar:
    // Precios y Alertas -> 12,2
    // Stock y Conversión -> 12,4
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "stock" TYPE numeric(12,4),
            ALTER COLUMN "conversion_to_base_qty" TYPE numeric(12,4),
            ALTER COLUMN "min_stock_alert" TYPE numeric(12,2),
            ALTER COLUMN "cost_price" TYPE numeric(12,2),
            ALTER COLUMN "sale_price" TYPE numeric(12,2);
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertimos a la precisión anterior (10,4 y 10,2 según tu entidad vieja)
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "stock" TYPE numeric(10,4),
            ALTER COLUMN "conversion_to_base_qty" TYPE numeric(10,4),
            ALTER COLUMN "min_stock_alert" TYPE numeric(10,2),
            ALTER COLUMN "cost_price" TYPE numeric(10,2),
            ALTER COLUMN "sale_price" TYPE numeric(10,2);
        `)
  }
}
