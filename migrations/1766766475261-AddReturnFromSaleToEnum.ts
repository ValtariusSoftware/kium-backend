import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddReturnFromSaleToEnum1766759000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // En Postgres, para agregar un valor a un ENUM se usa ALTER TYPE
    await queryRunner.query(
      `ALTER TYPE stock_control.inventory_transactions_type_enum ADD VALUE IF NOT EXISTS 'RETURN_FROM_SALE'`,
    )
  }

  public async down(): Promise<void> {
    // Los ENUMs en Postgres son difíciles de revertir (no se pueden quitar valores fácilmente)
    // Normalmente se deja así o se recrea el tipo.
  }
}
