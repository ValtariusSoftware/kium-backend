import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemoveTypeFromItems1767116526286 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Sincronizamos los flags por última vez basándonos en el Enum antes de borrarlo
    // Productos que se venden (RESELL y FINAL)
    await queryRunner.query(`
            UPDATE "stock_control"."items" 
            SET "is_saleable" = true 
            WHERE "type"::text IN ('RESELL_PRODUCT', 'FINAL_PRODUCT')
        `)

    // Productos que se fabrican (FINAL)
    await queryRunner.query(`
            UPDATE "stock_control"."items" 
            SET "is_produced" = true 
            WHERE "type"::text = 'FINAL_PRODUCT'
        `)

    // Productos que son insumos (INGREDIENT)
    await queryRunner.query(`
            UPDATE "stock_control"."items" 
            SET "is_ingredient" = true 
            WHERE "type"::text = 'INGREDIENT'
        `)

    // 2. Ahora sí, borramos la columna type
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP COLUMN "type"`,
    )

    // 3. Borramos el tipo ENUM de la base de datos para limpiar el esquema
    await queryRunner.query(`DROP TYPE "stock_control"."items_type_enum"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Para revertir, tendríamos que recrear el tipo y la columna
    await queryRunner.query(
      `CREATE TYPE "stock_control"."items_type_enum" AS ENUM('RESELL_PRODUCT', 'FINAL_PRODUCT', 'INGREDIENT')`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ADD "type" "stock_control"."items_type_enum"`,
    )

    // Nota: Re-poblar el 'type' desde los flags en un rollback es posible pero complejo,
    // aquí solo restauramos la estructura básica.
  }
}
