import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTrigramSearch1767705208420 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Habilitar la extensión de trigramas (necesaria para el índice GIN)
    // Se suele crear en public para que esté disponible en toda la DB
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

    // 2. Crear índice GIN para búsqueda por nombre (Búsqueda parcial rápida)
    // Usamos gin_trgm_ops para que sea compatible con ILIKE '%texto%'
    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_SEARCH_NAME" 
            ON "stock_control"."items" 
            USING gin ("name" gin_trgm_ops)
        `)

    // 3. Crear índice GIN para SKU y Barcode
    // Los creamos como índices parciales para ignorar valores nulos y ahorrar espacio
    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_SEARCH_SKU" 
            ON "stock_control"."items" 
            USING gin ("sku" gin_trgm_ops) 
            WHERE "sku" IS NOT NULL
        `)

    await queryRunner.query(`
            CREATE INDEX "IDX_ITEM_SEARCH_BARCODE" 
            ON "stock_control"."items" 
            USING gin ("barcode" gin_trgm_ops) 
            WHERE "barcode" IS NOT NULL
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminamos los índices en orden inverso
    await queryRunner.query(
      `DROP INDEX "stock_control"."IDX_ITEM_SEARCH_BARCODE"`,
    )
    await queryRunner.query(`DROP INDEX "stock_control"."IDX_ITEM_SEARCH_SKU"`)
    await queryRunner.query(`DROP INDEX "stock_control"."IDX_ITEM_SEARCH_NAME"`)

    // No solemos hacer DROP EXTENSION en el down por si otras tablas la usan,
    // pero si quieres una limpieza total podrías descomentar la siguiente línea:
    // await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm`);
  }
}
