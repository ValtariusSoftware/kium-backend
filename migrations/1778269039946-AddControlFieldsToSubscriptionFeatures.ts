import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddControlFieldsToSubscriptionFeatures1778269039946 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('stock_control.subscription_features', [
      new TableColumn({
        name: 'is_active',
        type: 'boolean',
        default: true,
      }),
      new TableColumn({
        name: 'is_highlighted',
        type: 'boolean',
        default: false,
      }),
      new TableColumn({
        name: 'limit_value',
        type: 'int',
        isNullable: true,
      }),
    ])
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Importante el orden inverso al eliminar para mantener consistencia
    await queryRunner.dropColumn(
      'stock_control.subscription_features',
      'limit_value',
    )
    await queryRunner.dropColumn(
      'stock_control.subscription_features',
      'is_highlighted',
    )
    await queryRunner.dropColumn(
      'stock_control.subscription_features',
      'is_active',
    )
  }
}
