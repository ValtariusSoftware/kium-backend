import { MigrationInterface, QueryRunner } from 'typeorm'

export class SyncFinalV1PlanFeatures1792359676939 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Desactivar flags globales en subscription_features para features no V1
    await queryRunner.query(`
            UPDATE stock_control.subscription_features 
            SET is_active = false 
            WHERE slug IN ('recipes_management', 'offline_access', 'no_ads');
        `)

    // 2. Apagar is_enabled en plan_features para las features inactivas en todos los planes
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = false, limits = NULL 
            WHERE feature_id IN (
                SELECT id FROM stock_control.subscription_features 
                WHERE slug IN ('recipes_management', 'offline_access', 'no_ads')
            );
        `)

    // 3. Configurar Plan FREE (Sin herramientas de lote ni métricas)
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = false, limits = NULL 
            WHERE plan_id = 'FREE' 
              AND feature_id IN (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug IN (
                      'bulk_upload', 
                      'multi_product_update', 
                      'multi_product_deletion', 
                      'profitability_reports', 
                      'analytics_least_selling'
                  )
              );
        `)

    // Límite de stock = 100 para FREE
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = true, limits = '{"max": 100}'::jsonb 
            WHERE plan_id = 'FREE' 
              AND feature_id = (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug = 'stock_limit'
              );
        `)

    // 4. Configurar Plan PRO ($8 USD)
    // Habilitar: multi_product_update
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = true, limits = NULL 
            WHERE plan_id = 'PRO' 
              AND feature_id = (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug = 'multi_product_update'
              );
        `)

    // Deshabilitar en PRO: bulk_upload, multi_product_deletion, profitability_reports, analytics_least_selling
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = false, limits = NULL 
            WHERE plan_id = 'PRO' 
              AND feature_id IN (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug IN (
                      'bulk_upload', 
                      'multi_product_deletion', 
                      'profitability_reports', 
                      'analytics_least_selling'
                  )
              );
        `)

    // 5. Configurar Plan PRO_PLUS ($12-$13 USD) y DEMO (Acceso completo a todo lo V1)
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = true, limits = NULL 
            WHERE plan_id IN ('PRO_PLUS', 'DEMO') 
              AND feature_id IN (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug IN (
                      'bulk_upload', 
                      'multi_product_update', 
                      'multi_product_deletion', 
                      'profitability_reports', 
                      'analytics_least_selling'
                  )
              );
        `)

    // Límite de stock = 3000 para PRO, PRO_PLUS y DEMO
    await queryRunner.query(`
            UPDATE stock_control.plan_features 
            SET is_enabled = true, limits = '{"max": 3000}'::jsonb 
            WHERE plan_id IN ('PRO', 'PRO_PLUS', 'DEMO') 
              AND feature_id = (
                  SELECT id FROM stock_control.subscription_features 
                  WHERE slug = 'stock_limit'
              );
        `)
  }

  public async down(): Promise<void> {
    // Rollback opcional
  }
}
