// Reemplazar el contenido de src/migrations/AddReferredByCodeToUsersXXXXXXXXXXX.ts

import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddReferredByCodeToUsers1764351348092 implements MigrationInterface {
  name = 'AddReferredByCodeToUsers1764351348092'

  // Nombre de la tabla con el esquema antepuesto
  private readonly tableNameWithSchema = 'stock_control.users'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Añade la nueva columna 'referred_by_code'
    await queryRunner.addColumn(
      this.tableNameWithSchema, // Pasa 'stock_control.users' como un solo string
      new TableColumn({
        name: 'referred_by_code',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      // Ya no hay tercer argumento, ni objeto de opciones
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En caso de deshacer la migración, elimina la columna
    await queryRunner.dropColumn(
      this.tableNameWithSchema, // Pasa 'stock_control.users'
      'referred_by_code',
      // Ya no hay tercer argumento
    )
  }
}
