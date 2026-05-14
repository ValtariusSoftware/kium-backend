import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIndexToRecipeIngredients1778616176575 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_recipe_ingredients_recipe_id" ON "stock_control"."recipe_ingredients" ("recipe_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "stock_control"."IDX_recipe_ingredients_recipe_id"`,
    )
  }
}
