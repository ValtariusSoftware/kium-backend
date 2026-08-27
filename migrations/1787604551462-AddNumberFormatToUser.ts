import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddNumberFormatToUser1787604551462 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar columna number_format a la tabla users dentro del schema stock_control
    await queryRunner.query(`
          ALTER TABLE "stock_control"."users" 
          ADD COLUMN "number_format" character varying(30) NOT NULL DEFAULT 'dot-decimal';
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback de la columna
    await queryRunner.query(`
          ALTER TABLE "stock_control"."users" 
          DROP COLUMN "number_format";
        `)
  }
}
