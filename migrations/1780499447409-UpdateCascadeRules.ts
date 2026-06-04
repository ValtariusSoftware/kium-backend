import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateCascadeRules1780499447409 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminar restricciones antiguas de recipes (usuario)
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipes" DROP CONSTRAINT IF EXISTS "FK_..._user_id"`,
    ) // Reemplaza "FK_..._user_id" por el nombre real de tu constraint si lo sabes
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipes" ADD CONSTRAINT "FK_recipes_user_id" FOREIGN KEY ("user_id") REFERENCES "stock_control"."users"("id") ON DELETE CASCADE`,
    )

    // 2. Eliminar restricciones antiguas de items (usuario)
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP CONSTRAINT IF EXISTS "FK_..._user_id"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD CONSTRAINT "FK_items_user_id" FOREIGN KEY ("user_id") REFERENCES "stock_control"."users"("id") ON DELETE CASCADE`,
    )

    // 3. Eliminar restricciones antiguas de recipe_ingredients (item y recipe)
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipe_ingredients" DROP CONSTRAINT IF EXISTS "FK_..._ingredient_item_id"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipe_ingredients" ADD CONSTRAINT "FK_ri_item_id" FOREIGN KEY ("ingredient_item_id") REFERENCES "stock_control"."items"("id") ON DELETE CASCADE`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir a RESTRICT o el comportamiento anterior
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipes" DROP CONSTRAINT "FK_recipes_user_id"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP CONSTRAINT "FK_items_user_id"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."recipe_ingredients" DROP CONSTRAINT "FK_ri_item_id"`,
    )
  }
}
