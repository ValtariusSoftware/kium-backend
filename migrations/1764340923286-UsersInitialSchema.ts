// Reemplazar el contenido de src/migrations/UsersInitialSchema1764340923286.ts

import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class UsersInitialSchema1764340923286 implements MigrationInterface {
  name = 'UsersInitialSchema1764340923286'

  // Método para crear la tabla
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        schema: 'stock_control', // Asegura que se crea en el esquema correcto
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '255',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'username',
            type: 'varchar',
            length: '100',
            isUnique: true, // CONSTRAINT users_username_key
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true, // CONSTRAINT users_email_key
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: true, // Tu SQL original tiene NULL
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: true, // Tu SQL original tiene NULL
          },
        ],
      }),
      true, // El segundo argumento 'ifNotExist' es true
    )
  }

  // Método para deshacer la creación (eliminar la tabla)
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Elimina la tabla 'users' dentro del esquema 'stock_control'
    await queryRunner.dropTable(
      new Table({ name: 'users', schema: 'stock_control' }),
      true,
    )
  }
}
