import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUserCreatedAtIndex1773697550500 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Creamos el índice dentro del esquema 'stock_control'
    // Es importante definir el nombre del índice explícitamente para evitar conflictos
    await queryRunner.query(`
            CREATE INDEX "IDX_USER_CREATED_AT" 
            ON stock_control.inventory_transactions (user_id, created_at);
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminamos el índice indicando el esquema
    await queryRunner.query(`
            DROP INDEX stock_control."IDX_USER_CREATED_AT";
        `)
  }
}
