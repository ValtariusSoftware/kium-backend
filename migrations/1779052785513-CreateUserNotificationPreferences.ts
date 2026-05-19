import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateUserNotificationPreferences1779052785513 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "stock_control"."user_notification_preferences" (
                "user_id" varchar(255) NOT NULL,
                "campaign_slug" varchar(100) NOT NULL,
                "is_enabled" boolean DEFAULT true NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "PK_user_notification_preferences" PRIMARY KEY ("user_id", "campaign_slug"),
                CONSTRAINT "FK_user_preferences_user" FOREIGN KEY ("user_id") 
                    REFERENCES "stock_control"."users"("id") ON DELETE CASCADE
            );
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "stock_control"."user_notification_preferences";
        `)
  }
}
