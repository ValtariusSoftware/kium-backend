import { MigrationInterface, QueryRunner } from 'typeorm'

export class SeedInitialPlans1792180383400 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insertar los 4 planes base de Kium
    await queryRunner.query(`
          INSERT INTO stock_control.plans (id, name, is_active, display_order) VALUES
          ('FREE', 'Plan Free', true, 1),
          ('DEMO', 'Plan Demo', true, 2),
          ('PRO', 'Plan Pro', true, 3),
          ('PRO_PLUS', 'Plan Pro+', true, 4)
          ON CONFLICT (id) DO NOTHING;
        `)

    // 2. Poblar plan_features relacionando cada plan con tus slugs reales de la DB

    // --- PLAN FREE (Límite de stock 100, sin masivos, funciones básicas) ---
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'FREE', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'stock_limit'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'FREE', id, true, '{"max": 10}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'bulk_upload'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'FREE', id, false, NULL 
          FROM stock_control.subscription_features WHERE slug IN ('multi_product_update', 'multi_product_deletion', 'profitability_reports', 'analytics_least_selling')
          ON CONFLICT DO NOTHING;
        `)

    // --- PLAN DEMO (Acceso total por 14 días, 3000 productos) ---
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'DEMO', id, true, '{"max": 3000}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'stock_limit'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'DEMO', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'bulk_upload'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'DEMO', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug IN ('multi_product_update', 'multi_product_deletion')
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'DEMO', id, true, NULL 
          FROM stock_control.subscription_features WHERE slug IN ('offline_access', 'recipes_management', 'profitability_reports', 'no_ads', 'analytics_least_selling')
          ON CONFLICT DO NOTHING;
        `)

    // --- PLAN PRO (Pago intermedio, 3000 productos, Android) ---
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO', id, true, '{"max": 3000}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'stock_limit'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'bulk_upload'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug IN ('multi_product_update', 'multi_product_deletion')
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO', id, true, NULL 
          FROM stock_control.subscription_features WHERE slug IN ('offline_access', 'recipes_management', 'no_ads')
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO', id, false, NULL 
          FROM stock_control.subscription_features WHERE slug IN ('profitability_reports', 'analytics_least_selling')
          ON CONFLICT DO NOTHING;
        `)

    // --- PLAN PRO_PLUS (Todo completo: 3000 productos + web + métricas avanzadas) ---
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO_PLUS', id, true, '{"max": 3000}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'stock_limit'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO_PLUS', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug = 'bulk_upload'
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO_PLUS', id, true, '{"max": 100}'::jsonb 
          FROM stock_control.subscription_features WHERE slug IN ('multi_product_update', 'multi_product_deletion')
          ON CONFLICT DO NOTHING;
        `)
    await queryRunner.query(`
          INSERT INTO stock_control.plan_features (plan_id, feature_id, is_enabled, limits) 
          SELECT 'PRO_PLUS', id, true, NULL 
          FROM stock_control.subscription_features WHERE slug IN ('offline_access', 'recipes_management', 'profitability_reports', 'no_ads', 'analytics_least_selling')
          ON CONFLICT DO NOTHING;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM stock_control.plan_features;`)
    await queryRunner.query(`DELETE FROM stock_control.plans;`)
  }
}
