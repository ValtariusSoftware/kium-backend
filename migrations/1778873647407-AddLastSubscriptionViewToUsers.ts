import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddLastSubscriptionViewToUsers1778873647407 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregamos la columna al esquema stock_control permitiendo nulos
    await queryRunner.query(`
            ALTER TABLE "stock_control"."users" 
            ADD COLUMN "last_subscription_view" TIMESTAMP NULL;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En caso de rollback, eliminamos la columna de forma segura
    await queryRunner.query(`
            ALTER TABLE "stock_control"."users" 
            DROP COLUMN "last_subscription_view";
        `)
  }
}
