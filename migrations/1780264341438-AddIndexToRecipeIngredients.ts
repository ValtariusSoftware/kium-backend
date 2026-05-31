import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIndexToRecipeIngredients1780264341438 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE INDEX "IDX_recipe_ingredients_ingredient_item_id" 
            ON stock_control.recipe_ingredients USING btree (ingredient_item_id);
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_recipe_ingredients_ingredient_item_id";
        `)
  }
}
