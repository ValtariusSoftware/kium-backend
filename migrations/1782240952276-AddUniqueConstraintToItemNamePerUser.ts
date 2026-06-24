import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUniqueConstraintToItemNamePerUser1782240952276 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_ITEM_NAME_PER_USER" 
            ON stock_control.items (user_id, name) 
            WHERE (deleted_at IS NULL);
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX IF EXISTS "UQ_ITEM_NAME_PER_USER";
        `)
  }
}
