import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreatePlansAndPlanFeaturesStructure1792176132019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear la tabla de planes (IDs en texto plano como 'FREE', 'PRO', etc.)
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS stock_control.plans (
                id VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT true,
                display_order INT NOT NULL DEFAULT 0,
                CONSTRAINT PK_plans PRIMARY KEY (id)
            );
        `)

    // 2. Crear la tabla puente plan_features usando gen_random_uuid() nativo de Postgres
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS stock_control.plan_features (
                id UUID DEFAULT gen_random_uuid() NOT NULL,
                plan_id VARCHAR(50) NOT NULL,
                feature_id UUID NOT NULL,
                is_enabled BOOLEAN NOT NULL DEFAULT true,
                limits JSONB NULL,
                CONSTRAINT PK_plan_features PRIMARY KEY (id),
                CONSTRAINT FK_plan_features_plan FOREIGN KEY (plan_id) REFERENCES stock_control.plans(id) ON DELETE CASCADE,
                CONSTRAINT FK_plan_features_feature FOREIGN KEY (feature_id) REFERENCES stock_control.subscription_features(id) ON DELETE CASCADE
            );
        `)

    // 3. Limpiar columnas obsoletas de subscription_features
    await queryRunner.query(`
            ALTER TABLE stock_control.subscription_features 
            DROP COLUMN IF EXISTS is_free,
            DROP COLUMN IF EXISTS is_pro;
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE stock_control.subscription_features ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.subscription_features ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT true;`,
    )
    await queryRunner.query(`DROP TABLE IF EXISTS stock_control.plan_features;`)
    await queryRunner.query(`DROP TABLE IF EXISTS stock_control.plans;`)
  }
}
