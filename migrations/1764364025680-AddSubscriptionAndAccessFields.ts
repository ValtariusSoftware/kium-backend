// src/migrations/AddSubscriptionAndAccessFields1764364025680.ts

import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

// Define los nombres de los tipos ENUM y la tabla para referencia
const subscriptionStatusEnumName = 'stock_control.SubscriptionStatus'
const accessLevelEnumName = 'stock_control.AccessLevel'
const tableNameWithSchema = 'stock_control.users'

export class AddSubscriptionAndAccessFields1764364025680 implements MigrationInterface {
  name = 'AddSubscriptionAndAccessFields1764364025680'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. CREAR ENUMS EN POSTGRESQL (Necesario antes de crear las columnas)
    await queryRunner.query(
      `CREATE TYPE ${subscriptionStatusEnumName} AS ENUM('ACTIVE', 'CANCELED', 'EXPIRED', 'NON_SUBSCRIBED')`,
    )
    await queryRunner.query(
      `CREATE TYPE ${accessLevelEnumName} AS ENUM('FREE', 'PRO')`,
    )

    // 2. AÑADIR COLUMNA subscription_start_date (No es ENUM, usamos TableColumn)
    await queryRunner.addColumn(
      tableNameWithSchema,
      new TableColumn({
        name: 'subscription_start_date',
        type: 'timestamp',
        isNullable: true,
      }),
    )

    // 3. AÑADIR COLUMNAS ENUM CON SQL DIRECTO (Evita el bug del 'map')
    // subscription_status
    await queryRunner.query(
      `ALTER TABLE ${tableNameWithSchema} ADD COLUMN subscription_status ${subscriptionStatusEnumName} NOT NULL DEFAULT 'NON_SUBSCRIBED'`,
    )

    // access_level
    await queryRunner.query(
      `ALTER TABLE ${tableNameWithSchema} ADD COLUMN access_level ${accessLevelEnumName} NOT NULL DEFAULT 'FREE'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. ELIMINAR COLUMNAS (Usando SQL directo)
    await queryRunner.query(
      `ALTER TABLE ${tableNameWithSchema} DROP COLUMN subscription_start_date`,
    )
    await queryRunner.query(
      `ALTER TABLE ${tableNameWithSchema} DROP COLUMN subscription_status`,
    )
    await queryRunner.query(
      `ALTER TABLE ${tableNameWithSchema} DROP COLUMN access_level`,
    )

    // 2. ELIMINAR ENUMS
    await queryRunner.query(`DROP TYPE ${accessLevelEnumName}`)
    await queryRunner.query(`DROP TYPE ${subscriptionStatusEnumName}`)
  }
}
