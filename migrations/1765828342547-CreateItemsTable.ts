// En tu archivo de migración (ej: CreateItemsTable1765828342547.ts)

import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm'

// Define el nombre del esquema que estás utilizando
const SCHEMA_NAME = 'stock_control'
const ITEMS_TABLE_NAME = 'items'
const USERS_TABLE_NAME = 'users'

export class CreateItemsTable1765828342547 implements MigrationInterface {
  name = 'CreateItemsTable1765828342547'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 💡 PASO 0: CREAR LA EXTENSIÓN uuid-ossp
    // Esto es necesario para que funcione uuid_generate_v4()
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    // 1. Crear ENUMs de PostgreSQL dentro del esquema 'stock_control'
    await queryRunner.query(
      `CREATE TYPE ${SCHEMA_NAME}.items_type_enum AS ENUM('RESELL_PRODUCT', 'FINAL_PRODUCT', 'INGREDIENT')`,
    )
    await queryRunner.query(
      `CREATE TYPE ${SCHEMA_NAME}.items_base_unit_enum AS ENUM('UNIT', 'KILOGRAM', 'LITER')`,
    )

    // 2. Crear la tabla ITEMS dentro del esquema 'stock_control'
    await queryRunner.createTable(
      new Table({
        name: ITEMS_TABLE_NAME,
        schema: SCHEMA_NAME,
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            // Ahora la función uuid_generate_v4() ya existe
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'type',
            type: `${SCHEMA_NAME}.items_type_enum`,
            isNullable: false,
          },
          {
            name: 'stock',
            type: 'decimal',
            precision: 10,
            scale: 4,
            default: '0.0000',
            isNullable: false,
          },
          {
            name: 'unit_of_stock_name',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'base_unit',
            type: `${SCHEMA_NAME}.items_base_unit_enum`,
            isNullable: false,
          },
          {
            name: 'conversion_to_base_qty',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'min_stock_alert',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'cost_price',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'sale_price',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    )

    // 3. Agregar la Clave Foránea
    await queryRunner.createForeignKey(
      `${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`,
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: USERS_TABLE_NAME,
        referencedSchema: SCHEMA_NAME,
        onDelete: 'CASCADE',
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Obtener y eliminar la clave foránea
    const table = await queryRunner.getTable(
      `${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`,
    )
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    )

    if (foreignKey) {
      await queryRunner.dropForeignKey(
        `${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`,
        foreignKey,
      )
    }

    // 2. Eliminar la tabla y los ENUMs
    await queryRunner.dropTable(`${SCHEMA_NAME}.${ITEMS_TABLE_NAME}`)
    await queryRunner.query(`DROP TYPE ${SCHEMA_NAME}.items_type_enum`)
    await queryRunner.query(`DROP TYPE ${SCHEMA_NAME}.items_base_unit_enum`)

    // 💡 PASO 0 (DOWN): Eliminar la extensión (Opcional, pero buena práctica)
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"')
  }
}
