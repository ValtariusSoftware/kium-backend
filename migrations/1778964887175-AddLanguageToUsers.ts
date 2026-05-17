import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddLanguageToUsers1778964887175 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."users" 
            ADD COLUMN "language" varchar(10) DEFAULT 'en' NOT NULL;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "stock_control"."users" 
            DROP COLUMN "language";
        `)
  }
}
