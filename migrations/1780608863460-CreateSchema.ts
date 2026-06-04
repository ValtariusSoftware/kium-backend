import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateSchema1780608863460 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "stock_control"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA "stock_control"`)
  }
}
