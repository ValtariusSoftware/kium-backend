import { MigrationInterface, QueryRunner } from 'typeorm'

export class CleanOldConstraint1780501249648 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminamos la constraint restrictiva que quedó huérfana
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipe_ingredients" DROP CONSTRAINT IF EXISTS "FK_dbf0fcc0a7b866c11388d7d012a"`,
    )
  }

  public async down(): Promise<void> {
    // Si necesitaras revertir (difícil, porque esta constraint es la que causa problemas)
    // Normalmente puedes dejar esto vacío o re-crear la restricción si fuera necesario.
  }
}
