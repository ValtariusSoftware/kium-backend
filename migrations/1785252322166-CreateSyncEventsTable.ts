import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateSyncEventsTable1785252322166 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          CREATE TABLE "stock_control"."sync_events" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "user_id" character varying(255) NOT NULL,
            "sequence_number" bigint NOT NULL,
            "entity_type" character varying(50) NOT NULL,
            "entity_id" uuid NOT NULL,
            "action" character varying(20) NOT NULL,
            "origin_client_id" character varying(255),
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_sync_events_id" PRIMARY KEY ("id")
          )
        `)

    await queryRunner.query(`
          CREATE INDEX "IDX_sync_events_user_id_sequence_number" 
          ON "stock_control"."sync_events" ("user_id", "sequence_number")
        `)

    await queryRunner.query(`
          ALTER TABLE "stock_control"."sync_events" 
          ADD CONSTRAINT "FK_sync_events_user_id" 
          FOREIGN KEY ("user_id") 
          REFERENCES "stock_control"."users"("id") 
          ON DELETE CASCADE ON UPDATE NO ACTION
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE "stock_control"."sync_events" 
          DROP CONSTRAINT "FK_sync_events_user_id"
        `)

    await queryRunner.query(`
          DROP INDEX "stock_control"."IDX_sync_events_user_id_sequence_number"
        `)

    await queryRunner.query(`
          DROP TABLE "stock_control"."sync_events"
        `)
  }
}
