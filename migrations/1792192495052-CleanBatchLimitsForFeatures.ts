import { MigrationInterface, QueryRunner } from 'typeorm'

export class CleanBatchLimitsForFeatures1792192495052 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ponemos en NULL la columna 'limits' para las features de borrado y actualización masiva
    // apuntando explícitamente al esquema stock_control
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET limits = NULL 
            WHERE feature_id IN (
                SELECT id FROM stock_control.subscription_features 
                WHERE slug IN ('multi_product_deletion', 'multi_product_update')
            );
        `)
  }

  public async down(): Promise<void> {
    // Opcional: Si quisieras revertir, podrías reasignar un límite por defecto,
    // pero como decidimos quitarlos por completo, se puede dejar vacío.
  }
}
