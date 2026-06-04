import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCascadeDeleteToUserRelations1780444360460 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Items (Tenías dos FK, borramos ambas para asegurar el CASCADE)
    await queryRunner.query(
      `ALTER TABLE stock_control.items DROP CONSTRAINT IF EXISTS "FK_3b934e62fb52bac909e0ddf5422";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.items DROP CONSTRAINT IF EXISTS "FK_user_items";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.items ADD CONSTRAINT "FK_user_items" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id") ON DELETE CASCADE;`,
    )

    // 2. Sales
    await queryRunner.query(
      `ALTER TABLE stock_control.sales DROP CONSTRAINT IF EXISTS "FK_5f282f3656814ec9ca2675aef6f";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.sales ADD CONSTRAINT "FK_5f282f3656814ec9ca2675aef6f" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id") ON DELETE CASCADE;`,
    )

    // 3. Recipes
    await queryRunner.query(
      `ALTER TABLE stock_control.recipes DROP CONSTRAINT IF EXISTS "FK_67d98fd6ff56c4340a811402154";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.recipes ADD CONSTRAINT "FK_67d98fd6ff56c4340a811402154" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id") ON DELETE CASCADE;`,
    )

    // 4. Inventory Transactions
    await queryRunner.query(
      `ALTER TABLE stock_control.inventory_transactions DROP CONSTRAINT IF EXISTS "FK_user_inventory_transactions";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.inventory_transactions ADD CONSTRAINT "FK_user_inventory_transactions" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id") ON DELETE CASCADE;`,
    )

    // 5. User Campaign Tracker
    await queryRunner.query(
      `ALTER TABLE stock_control.user_campaign_tracker DROP CONSTRAINT IF EXISTS "FK_user_campaign_tracker_user";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.user_campaign_tracker ADD CONSTRAINT "FK_user_campaign_tracker_user" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id") ON DELETE CASCADE;`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertimos a NO ACTION (comportamiento por defecto)
    await queryRunner.query(
      `ALTER TABLE stock_control.items DROP CONSTRAINT "FK_user_items";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.items ADD CONSTRAINT "FK_user_items" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id");`,
    )

    await queryRunner.query(
      `ALTER TABLE stock_control.sales DROP CONSTRAINT "FK_5f282f3656814ec9ca2675aef6f";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.sales ADD CONSTRAINT "FK_5f282f3656814ec9ca2675aef6f" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id");`,
    )

    await queryRunner.query(
      `ALTER TABLE stock_control.recipes DROP CONSTRAINT "FK_67d98fd6ff56c4340a811402154";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.recipes ADD CONSTRAINT "FK_67d98fd6ff56c4340a811402154" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id");`,
    )

    await queryRunner.query(
      `ALTER TABLE stock_control.inventory_transactions DROP CONSTRAINT "FK_user_inventory_transactions";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.inventory_transactions ADD CONSTRAINT "FK_user_inventory_transactions" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id");`,
    )

    await queryRunner.query(
      `ALTER TABLE stock_control.user_campaign_tracker DROP CONSTRAINT "FK_user_campaign_tracker_user";`,
    )
    await queryRunner.query(
      `ALTER TABLE stock_control.user_campaign_tracker ADD CONSTRAINT "FK_user_campaign_tracker_user" FOREIGN KEY ("user_id") REFERENCES stock_control.users("id");`,
    )
  }
}
