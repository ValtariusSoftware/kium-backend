import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemoveLimitsFromSubscriptionFeatures1792182654743 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminamos la columna limits obsoleta de subscription_features
    await queryRunner.query(`
          ALTER TABLE stock_control.subscription_features 
          DROP COLUMN IF EXISTS limits;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en caso de rollback
    await queryRunner.query(`
          ALTER TABLE stock_control.subscription_features 
          ADD COLUMN IF NOT EXISTS limits JSONB NULL;
        `)
  }
}
