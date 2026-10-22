import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateUsersAccessAndTrial1792176116408 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar valores al tipo ENUM accesslevel en el schema stock_control
    await queryRunner.query(
      `ALTER TYPE stock_control.accesslevel ADD VALUE IF NOT EXISTS 'DEMO';`,
    )
    await queryRunner.query(
      `ALTER TYPE stock_control.accesslevel ADD VALUE IF NOT EXISTS 'PRO_PLUS';`,
    )

    // 2. Agregar la columna trial_ends_at a la tabla users
    await queryRunner.query(
      `ALTER TABLE stock_control.users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP NULL;`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Nota: PostgreSQL no permite eliminar fácilmente valores de un ENUM en production sin recrearlo,
    // pero podemos revertir la columna de la tabla.
    await queryRunner.query(
      `ALTER TABLE stock_control.users DROP COLUMN IF EXISTS trial_ends_at;`,
    )
  }
}
