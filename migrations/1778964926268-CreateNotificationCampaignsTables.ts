import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateNotificationCampaignsTables1778964926268 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tabla Madre: Registra los slugs únicos de cada tipo de notificación
    await queryRunner.query(`
            CREATE TABLE "stock_control"."notification_campaigns" (
                "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
                "slug" varchar(100) NOT NULL,
                "is_active" bool DEFAULT true NOT NULL,
                "updated_at" timestamp DEFAULT now() NOT NULL,
                CONSTRAINT "PK_notification_campaigns" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_notification_campaign_slug" UNIQUE ("slug")
            );
        `)

    // 2. Tabla Traducciones: Almacena título y cuerpo para cada idioma
    await queryRunner.query(`
            CREATE TABLE "stock_control"."notification_campaign_translations" (
                "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
                "language_code" varchar(10) NOT NULL,
                "title" text NOT NULL,
                "body" text NOT NULL,
                "campaign_id" uuid NOT NULL,
                CONSTRAINT "PK_notification_campaign_translations" PRIMARY KEY ("id"),
                CONSTRAINT "FK_notification_campaign_translation" FOREIGN KEY ("campaign_id") 
                    REFERENCES "stock_control"."notification_campaigns"("id") ON DELETE CASCADE
            );
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "stock_control"."notification_campaign_translations";`,
    )
    await queryRunner.query(
      `DROP TABLE "stock_control"."notification_campaigns";`,
    )
  }
}
