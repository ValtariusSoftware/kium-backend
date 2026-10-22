import { MigrationInterface, QueryRunner } from 'typeorm'

export class CleanBulkUploadLimitsAndPermissions1792193015659 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Deshabilitar la función bulk_upload para el plan FREE
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = false, limits = NULL 
            WHERE plan_id = 'FREE' 
              AND feature_id IN (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug = 'bulk_upload'
              );
        `)

    // 2. Limpiar la columna limits (poner en NULL) para bulk_upload en el resto de los planes (DEMO, PRO, PRO_PLUS)
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET limits = NULL 
            WHERE feature_id IN (
                SELECT id FROM stock_control.subscription_features 
                WHERE slug = 'bulk_upload'
            );
        `)
  }

  public async down(): Promise<void> {
    // Rollback opcional
  }
}
