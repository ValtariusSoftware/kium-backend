import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateInventoryTransactionTypeEnum1771696942842 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // En Postgres, para agregar un valor a un ENUM existente se usa ALTER TYPE.
    // Es importante notar que ALTER TYPE ADD VALUE no puede ejecutarse dentro de un bloque de transacción
    // en algunas versiones de Postgres, pero TypeORM suele manejarlo bien.

    await queryRunner.query(
      `ALTER TYPE "stock_control"."inventory_transactions_type_enum" ADD VALUE IF NOT EXISTS 'MEASUREMENT_ADJUSTMENT'`,
    )
  }

  public async down(): Promise<void> {
    // Nota: Postgres no permite eliminar fácilmente un valor de un ENUM (DROP VALUE no existe).
    // Generalmente, en las migraciones de ENUMS, el down se deja vacío o se revierte el tipo completo,
    // pero para este caso lo más seguro es dejarlo así para no perder integridad de datos.
  }
}
