import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddFcmTokensToUsers1778796558970 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregamos la columna como un array de texto dentro del schema stock_control
    await queryRunner.query(
      `ALTER TABLE "stock_control"."users" 
             ADD COLUMN "fcm_tokens" text[] NOT NULL DEFAULT '{}'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertimos el cambio eliminando la columna
    await queryRunner.query(
      `ALTER TABLE "stock_control"."users" 
             DROP COLUMN "fcm_tokens"`,
    )
  }
}
