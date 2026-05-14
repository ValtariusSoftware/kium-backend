import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateBaseUnitEnumAndFamilies1778783986844 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Creamos un tipo temporal con la estructura global deseada
    await queryRunner.query(`
            CREATE TYPE "stock_control"."items_base_unit_enum_new" AS ENUM (
                'UNIT', 'PACK', 'BOX',
                'MILLIGRAM', 'GRAM', 'KILOGRAM', 'OUNCE', 'POUND',
                'MILLILITER', 'LITER', 'FL_OUNCE', 'GALLON',
                'MILLIMETER', 'CENTIMETER', 'METER', 'INCH', 'FOOT',
                'SQUARE_METER', 'SQUARE_FOOT'
            );
        `)

    // 2. Actualizamos las columnas en la tabla 'items'
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "base_unit" TYPE "stock_control"."items_base_unit_enum_new" 
            USING "base_unit"::text::"stock_control"."items_base_unit_enum_new";
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "purchase_unit" TYPE "stock_control"."items_base_unit_enum_new" 
            USING "purchase_unit"::text::"stock_control"."items_base_unit_enum_new";
        `)

    // 3. Actualizamos la columna en la tabla 'recipe_ingredients'
    await queryRunner.query(`
            ALTER TABLE "stock_control"."recipe_ingredients" 
            ALTER COLUMN "unit_of_measure" TYPE "stock_control"."items_base_unit_enum_new" 
            USING "unit_of_measure"::text::"stock_control"."items_base_unit_enum_new";
        `)

    // 4. Eliminamos el tipo viejo y renombramos el nuevo para que coincida con tus Entidades
    await queryRunner.query(`DROP TYPE "stock_control"."items_base_unit_enum";`)
    await queryRunner.query(
      `ALTER TYPE "stock_control"."items_base_unit_enum_new" RENAME TO "items_base_unit_enum";`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En el down volvemos a la lista anterior (incluyendo los que eliminamos)
    await queryRunner.query(`
            CREATE TYPE "stock_control"."items_base_unit_enum_old" AS ENUM (
                'UNIT', 'PACK', 'BOX', 'ROLL', 'BAG', 'PALLET', 
                'METER', 'CENTIMETER', 'MILLIMETER', 'FOOT', 'YARD', 
                'SQUARE_METER', 'KILOGRAM', 'GRAM', 'MILLIGRAM', 'POUND', 
                'OUNCE', 'LITER', 'MILLILITER', 'GALLON', 'FL_OUNCE', 
                'CUBIC_METER', 'HOUR', 'DAY'
            );
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ALTER COLUMN "base_unit" TYPE "stock_control"."items_base_unit_enum_old" 
            USING "base_unit"::text::"stock_control"."items_base_unit_enum_old";
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."recipe_ingredients" 
            ALTER COLUMN "unit_of_measure" TYPE "stock_control"."items_base_unit_enum_old" 
            USING "unit_of_measure"::text::"stock_control"."items_base_unit_enum_old";
        `)

    await queryRunner.query(`DROP TYPE "stock_control"."items_base_unit_enum";`)
    await queryRunner.query(
      `ALTER TYPE "stock_control"."items_base_unit_enum_old" RENAME TO "items_base_unit_enum";`,
    )
  }
}
