import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCascadeToSyncEvents1785942279354 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."sync_events"
            DROP CONSTRAINT IF EXISTS "FK_sync_events_user_id";
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."sync_events"
            ADD CONSTRAINT "FK_sync_events_user_id"
            FOREIGN KEY ("user_id")
            REFERENCES "stock_control"."users"("id")
            ON DELETE CASCADE;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."sync_events"
            DROP CONSTRAINT IF EXISTS "FK_sync_events_user_id";
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."sync_events"
            ADD CONSTRAINT "FK_sync_events_user_id"
            FOREIGN KEY ("user_id")
            REFERENCES "stock_control"."users"("id");
        `)
  }
}
