import { MigrationInterface, QueryRunner } from 'typeorm'

export class ModifyLastNotifiedAtInCampaignTracker1779131649534 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Modifica la columna existente para asegurar que acepte NULL en Postgres
    await queryRunner.query(`
            ALTER TABLE "stock_control"."user_campaign_tracker" 
            ALTER COLUMN "last_notified_at" DROP NOT NULL;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Por si necesitas volver atrás, revierte la columna a NOT NULL
    await queryRunner.query(`
            ALTER TABLE "stock_control"."user_campaign_tracker" 
            ALTER COLUMN "last_notified_at" SET NOT NULL;
        `)
  }
}
