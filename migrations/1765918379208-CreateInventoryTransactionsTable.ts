import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm'

const TransactionTypeValues = [
  'INITIAL_INVENTORY',
  'PURCHASE',
  'PRODUCTION_IN',
  'ADJUSTMENT_IN',
  'SALE',
  'CONSUMPTION',
  'PRODUCTION_OUT',
  'ADJUSTMENT_OUT',
]

export class CreateInventoryTransactionsTable1765918379208 implements MigrationInterface {
  private readonly schema = 'stock_control'
  private readonly tableName = 'inventory_transactions'
  private readonly itemsTableName = 'items'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear el tipo ENUM para PostgreSQL
    await queryRunner.query(`
            CREATE TYPE "${this.schema}"."inventory_transactions_type_enum" AS ENUM (${TransactionTypeValues.map((v) => `'${v}'`).join(', ')});
        `)

    // 2. Crear la tabla
    await queryRunner.createTable(
      new Table({
        name: `${this.schema}.${this.tableName}`,
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'item_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'type',
            type: `${this.schema}.inventory_transactions_type_enum`, // Referencia al ENUM
            isNullable: false,
          },
          {
            name: 'quantity',
            type: 'numeric',
            precision: 12,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'unit_cost_snapshot',
            type: 'numeric',
            precision: 10,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'document_ref',
            type: 'varchar',
            length: '255', // La longitud debe ser un string si tu TS es estricto
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    )

    // 3. Crear el índice para búsquedas rápidas por Item y Usuario
    await queryRunner.createIndex(
      `${this.schema}.${this.tableName}`,
      new TableIndex({
        name: 'IDX_INVENTORY_TRANS_ITEM_USER',
        columnNames: ['item_id', 'user_id'],
      }),
    )

    // 4. Crear la Clave Foránea (Foreign Key) al Item
    await queryRunner.createForeignKey(
      `${this.schema}.${this.tableName}`,
      new TableForeignKey({
        columnNames: ['item_id'],
        referencedColumnNames: ['id'],
        referencedTableName: `${this.schema}.${this.itemsTableName}`,
        onDelete: 'CASCADE',
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminar la Clave Foránea
    const table = await queryRunner.getTable(`${this.schema}.${this.tableName}`)
    const foreignKey = table?.foreignKeys.find(
      (fk) =>
        fk.columnNames.includes('item_id') &&
        fk.referencedTableName === `${this.schema}.${this.itemsTableName}`,
    )
    if (foreignKey) {
      await queryRunner.dropForeignKey(
        `${this.schema}.${this.tableName}`,
        foreignKey,
      )
    }

    // 2. Eliminar el índice
    await queryRunner.dropIndex(
      `${this.schema}.${this.tableName}`,
      'IDX_INVENTORY_TRANS_ITEM_USER',
    )

    // 3. Eliminar la tabla
    await queryRunner.dropTable(`${this.schema}.${this.tableName}`)

    // 4. Eliminar el tipo ENUM
    await queryRunner.query(
      `DROP TYPE "${this.schema}"."inventory_transactions_type_enum"`,
    )
  }
}
