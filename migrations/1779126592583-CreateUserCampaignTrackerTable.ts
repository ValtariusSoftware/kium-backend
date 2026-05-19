import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateUserCampaignTrackerTable1779126592583 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "stock_control"."user_campaign_tracker" (
                "user_id" varchar(255) NOT NULL,
                "campaign_slug" varchar(100) NOT NULL,
                "last_triggered_at" timestamp NOT NULL DEFAULT now(),
                "last_notified_at" timestamp,
                CONSTRAINT "PK_user_campaign_tracker" PRIMARY KEY ("user_id", "campaign_slug"),
                CONSTRAINT "FK_user_campaign_tracker_user" FOREIGN KEY ("user_id") 
                    REFERENCES "stock_control"."users"("id") ON DELETE CASCADE
            );
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "stock_control"."user_campaign_tracker";
        `)
  }
}
