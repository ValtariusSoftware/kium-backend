import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPaymentMethodAndUpdatedAtToSales1773955729364 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregamos las 3 columnas en una sola pasada
    await queryRunner.query(`
            ALTER TABLE "stock_control"."sales" 
            ADD COLUMN "payment_method" varchar(50) NOT NULL DEFAULT 'CASH',
            ADD COLUMN "notes" text,
            ADD COLUMN "updated_at" TIMESTAMP NOT NULL DEFAULT now();
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertimos los cambios en orden inverso
    await queryRunner.query(`
            ALTER TABLE "stock_control"."sales" 
            DROP COLUMN "updated_at",
            DROP COLUMN "notes",
            DROP COLUMN "payment_method";
        `)
  }
}
