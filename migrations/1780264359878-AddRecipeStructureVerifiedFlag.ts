import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRecipeStructureVerifiedFlag1780264359878 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE stock_control.recipes 
            ADD COLUMN "is_recipe_structure_verified" boolean DEFAULT true NOT NULL;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE stock_control.recipes 
            DROP COLUMN "is_recipe_structure_verified";
        `)
  }
}
