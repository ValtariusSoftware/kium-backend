import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm'

export class CreateSubscriptionTables1778200365608 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear la tabla de Features (Beneficios)
    await queryRunner.createTable(
      new Table({
        name: 'stock_control.subscription_features',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'is_free',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_pro',
            type: 'boolean',
            default: true,
          },
          {
            name: 'display_order',
            type: 'int',
            default: 0,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    )

    // 2. Crear la tabla de Traducciones
    await queryRunner.createTable(
      new Table({
        name: 'stock_control.subscription_feature_translations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'language_code',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'name',
            type: 'text',
          },
          {
            name: 'feature_id',
            type: 'uuid',
          },
        ],
      }),
      true,
    )

    // 3. Crear la Foreign Key (Relación)
    await queryRunner.createForeignKey(
      'stock_control.subscription_feature_translations',
      new TableForeignKey({
        columnNames: ['feature_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'stock_control.subscription_features',
        onDelete: 'CASCADE',
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El orden de borrado es inverso al de creación
    await queryRunner.dropTable(
      'stock_control.subscription_feature_translations',
    )
    await queryRunner.dropTable('stock_control.subscription_features')
  }
}
