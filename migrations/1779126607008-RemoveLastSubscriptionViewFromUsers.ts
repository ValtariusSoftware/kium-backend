import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemoveLastSubscriptionViewFromUsers1779126607008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."users" DROP COLUMN "last_subscription_view";
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."users" ADD "last_subscription_view" timestamp NULL;
        `)
  }
}
