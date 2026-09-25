import { MigrationInterface, QueryRunner } from 'typeorm'

export class ChangeEntityIdToVarchar1790283657830 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alteramos la columna entity_id en la tabla sync_events para que soporte tanto UUIDs como strings de Firebase (varchar)
    await queryRunner.query(`
            ALTER TABLE stock_control.sync_events 
            ALTER COLUMN entity_id TYPE VARCHAR(255) USING entity_id::VARCHAR;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En caso de revertir, intentamos volverla a UUID (ojo: fallará si ya existen registros con strings de Firebase)
    await queryRunner.query(`
            ALTER TABLE stock_control.sync_events 
            ALTER COLUMN entity_id TYPE UUID USING entity_id::UUID;
        `)
  }
}
