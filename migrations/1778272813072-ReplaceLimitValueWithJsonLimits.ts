import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class ReplaceLimitValueWithJsonLimits1778272813072 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminamos la columna antigua limit_value
    await queryRunner.dropColumn(
      'stock_control.subscription_features',
      'limit_value',
    )

    // 2. Creamos la nueva columna 'limits' de tipo jsonb
    await queryRunner.addColumn(
      'stock_control.subscription_features',
      new TableColumn({
        name: 'limits',
        type: 'jsonb',
        isNullable: true,
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Operación inversa para revertir la migración
    await queryRunner.dropColumn(
      'stock_control.subscription_features',
      'limits',
    )

    await queryRunner.addColumn(
      'stock_control.subscription_features',
      new TableColumn({
        name: 'limit_value',
        type: 'int',
        isNullable: true,
      }),
    )
  }
}
