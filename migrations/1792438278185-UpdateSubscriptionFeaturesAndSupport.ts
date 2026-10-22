import { MigrationInterface, QueryRunner } from 'typeorm'

export class UpdateSubscriptionFeaturesAndSupport1792438278185 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insertar los nuevos slugs de soporte si no existen
    await queryRunner.query(`
            INSERT INTO stock_control.subscription_features (id, slug, display_order, is_active, is_highlighted, updated_at)
            VALUES 
            (gen_random_uuid(), 'email_support', 11, true, false, NOW()),
            (gen_random_uuid(), 'priority_email_support', 12, true, false, NOW())
            ON CONFLICT (slug) DO NOTHING;
        `)

    // 2. Insertar traducciones para 'email_support' (Plan PRO)
    await queryRunner.query(`
            INSERT INTO stock_control.subscription_feature_translations (id, language_code, name, feature_id)
            SELECT gen_random_uuid(), t.language_code, t.name, f.id
            FROM stock_control.subscription_features f
            CROSS JOIN (VALUES 
                ('es', 'Soporte ante dudas vía e-mail'),
                ('en', 'Email support'),
                ('pt', 'Suporte por e-mail'),
                ('de', 'E-Mail-Support'),
                ('fr', 'Support par e-mail'),
                ('it', 'Supporto via e-mail')
            ) AS t(language_code, name)
            WHERE f.slug = 'email_support'
            ON CONFLICT DO NOTHING;
        `)

    // 3. Insertar traducciones para 'priority_email_support' (Plan PRO_PLUS)
    await queryRunner.query(`
            INSERT INTO stock_control.subscription_feature_translations (id, language_code, name, feature_id)
            SELECT gen_random_uuid(), t.language_code, t.name, f.id
            FROM stock_control.subscription_features f
            CROSS JOIN (VALUES 
                ('es', 'Soporte prioritario vía e-mail'),
                ('en', 'Priority email support'),
                ('pt', 'Suporte prioritário por e-mail'),
                ('de', 'Bevorzugter E-Mail-Support'),
                ('fr', 'Support prioritaire par e-mail'),
                ('it', 'Supporto prioritario via e-mail')
            ) AS t(language_code, name)
            WHERE f.slug = 'priority_email_support'
            ON CONFLICT DO NOTHING;
        `)

    // 4. Actualizar textos de 'multi_product_update' a "múltiple" en todos los idiomas
    const updateEdits = [
      ['es', 'Edición múltiple de catálogo'],
      ['en', 'Multiple catalog editing'],
      ['pt', 'Edição múltipla de catálogo'],
      ['de', 'Mehrfachbearbeitung des Katalogs'],
      ['fr', 'Édition multiple de catalogue'],
      ['it', 'Modifica multipla del catalogo'],
    ]
    for (const [lang, name] of updateEdits) {
      await queryRunner.query(
        `
                UPDATE stock_control.subscription_feature_translations t
                SET name = $1
                FROM stock_control.subscription_features f
                WHERE t.feature_id = f.id AND f.slug = 'multi_product_update' AND t.language_code = $2;
            `,
        [name, lang],
      )
    }

    // 5. Actualizar textos de 'multi_product_deletion' a "múltiple/borrado múltiple" en todos los idiomas
    const updateDeletions = [
      ['es', 'Borrado múltiple de productos'],
      ['en', 'Multiple product deletion'],
      ['pt', 'Exclusão múltipla de produtos'],
      ['de', 'Mehrfachlöschung von Produkten'],
      ['fr', 'Suppression multiple de produits'],
      ['it', 'Eliminazione multipla di prodotti'],
    ]
    for (const [lang, name] of updateDeletions) {
      await queryRunner.query(
        `
                UPDATE stock_control.subscription_feature_translations t
                SET name = $1
                FROM stock_control.subscription_features f
                WHERE t.feature_id = f.id AND f.slug = 'multi_product_deletion' AND t.language_code = $2;
            `,
        [name, lang],
      )
    }

    // 6. Vincular 'email_support' al plan PRO en plan_features
    await queryRunner.query(`
            INSERT INTO stock_control.plan_features (id, plan_id, feature_id, is_enabled)
            SELECT gen_random_uuid(), 'PRO', f.id, true
            FROM stock_control.subscription_features f
            WHERE f.slug = 'email_support'
            ON CONFLICT DO NOTHING;
        `)

    // 7. Vincular 'priority_email_support' al plan PRO_PLUS en plan_features
    await queryRunner.query(`
            INSERT INTO stock_control.plan_features (id, plan_id, feature_id, is_enabled)
            SELECT gen_random_uuid(), 'PRO_PLUS', f.id, true
            FROM stock_control.subscription_features f
            WHERE f.slug = 'priority_email_support'
            ON CONFLICT DO NOTHING;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback opcional por si necesitás dar marcha atrás
    await queryRunner.query(`
            DELETE FROM stock_control.subscription_features WHERE slug IN ('email_support', 'priority_email_support');
        `)
  }
}
