import { MigrationInterface, QueryRunner } from 'typeorm'

export class FixUserReferenceTypes1765993734313 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminamos las llaves foráneas existentes que apuntan a user_id
    // Nota: En inventory_transactions no habías creado la FK formalmente hacia users aún,
    // pero la eliminamos por si TypeORM la generó automáticamente.
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP CONSTRAINT IF EXISTS "FK_user_items"`,
    )

    // 2. Cambiamos el tipo de dato de UUID a VARCHAR(255) en ITEMS
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ALTER COLUMN "user_id" TYPE varchar(255)`,
    )

    // 3. Cambiamos el tipo de dato en INVENTORY_TRANSACTIONS
    await queryRunner.query(
      `ALTER TABLE "stock_control"."inventory_transactions" ALTER COLUMN "user_id" TYPE varchar(255)`,
    )

    // 4. Creamos/Restauramos las llaves foráneas con el tipo correcto
    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ADD CONSTRAINT "FK_user_items" 
            FOREIGN KEY ("user_id") REFERENCES "stock_control"."users"("id") ON DELETE CASCADE
        `)

    await queryRunner.query(`
            ALTER TABLE "stock_control"."inventory_transactions" 
            ADD CONSTRAINT "FK_user_inventory_transactions" 
            FOREIGN KEY ("user_id") REFERENCES "stock_control"."users"("id") ON DELETE CASCADE
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Proceso inverso: Volver a UUID (esto fallará si hay datos de Firebase, pero es el estándar de rollback)
    await queryRunner.query(
      `ALTER TABLE "stock_control"."inventory_transactions" DROP CONSTRAINT "FK_user_inventory_transactions"`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" DROP CONSTRAINT "FK_user_items"`,
    )

    await queryRunner.query(
      `ALTER TABLE "stock_control"."inventory_transactions" ALTER COLUMN "user_id" TYPE uuid USING user_id::uuid`,
    )
    await queryRunner.query(
      `ALTER TABLE "stock_control"."items" ALTER COLUMN "user_id" TYPE uuid USING user_id::uuid`,
    )

    await queryRunner.query(`
            ALTER TABLE "stock_control"."items" 
            ADD CONSTRAINT "FK_user_items" 
            FOREIGN KEY ("user_id") REFERENCES "stock_control"."users"("id") ON DELETE CASCADE
        `)
  }
}
