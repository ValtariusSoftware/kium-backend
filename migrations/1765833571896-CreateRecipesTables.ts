import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm'

const SCHEMA_NAME = 'stock_control'
const RECIPES_TABLE_NAME = 'recipes'
const RECIPE_INGREDIENTS_TABLE_NAME = 'recipe_ingredients'
const ITEMS_TABLE_NAME = 'items'
const USERS_TABLE_NAME = 'users'

export class CreateRecipesTables1765833571896 implements MigrationInterface {
  name = 'CreateRecipesTables1765833571896'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- 1. Crear la tabla RECIPES (Encabezado) ---
    await queryRunner.createTable(
      new Table({
        name: RECIPES_TABLE_NAME,
        schema: SCHEMA_NAME,
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'final_product_id',
            type: 'uuid',
            isUnique: true, // Una receta por producto final (OneToOne)
            isNullable: false,
          },
          {
            name: 'yield_quantity',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    )

    // --- 2. Crear la tabla RECIPE_INGREDIENTS (Detalle) ---
    // NOTA: Reutilizamos el ENUM items_base_unit_enum creado en la migración anterior.
    await queryRunner.createTable(
      new Table({
        name: RECIPE_INGREDIENTS_TABLE_NAME,
        schema: SCHEMA_NAME,
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'recipe_id', // FK al encabezado de la receta
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'ingredient_item_id', // FK al Item usado como ingrediente
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'quantity_required',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'unit_of_measure',
            // Referencia al ENUM existente
            type: `${SCHEMA_NAME}.items_base_unit_enum`,
            isNullable: false,
          },
          {
            name: 'notes',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
        ],
      }),
      true,
    )

    // --- 3. Claves Foráneas para RECIPES ---

    // FK 1: USER -> RECIPES
    await queryRunner.createForeignKey(
      `${SCHEMA_NAME}.${RECIPES_TABLE_NAME}`,
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: USERS_TABLE_NAME,
        referencedSchema: SCHEMA_NAME,
        onDelete: 'CASCADE', // Si se borra el usuario, se borran sus recetas
      }),
    )

    // FK 2: ITEM (final_product) -> RECIPES
    await queryRunner.createForeignKey(
      `${SCHEMA_NAME}.${RECIPES_TABLE_NAME}`,
      new TableForeignKey({
        columnNames: ['final_product_id'],
        referencedColumnNames: ['id'],
        referencedTableName: ITEMS_TABLE_NAME,
        referencedSchema: SCHEMA_NAME,
        onDelete: 'CASCADE', // Si se borra el producto final, se borra la receta
      }),
    )

    // --- 4. Claves Foráneas para RECIPE_INGREDIENTS ---

    // FK 3: RECIPE -> RECIPE_INGREDIENTS
    await queryRunner.createForeignKey(
      `${SCHEMA_NAME}.${RECIPE_INGREDIENTS_TABLE_NAME}`,
      new TableForeignKey({
        columnNames: ['recipe_id'],
        referencedColumnNames: ['id'],
        referencedTableName: RECIPES_TABLE_NAME,
        referencedSchema: SCHEMA_NAME,
        onDelete: 'CASCADE', // Si se borra la receta, se borran sus ingredientes de detalle
      }),
    )

    // FK 4: ITEM (ingredient) -> RECIPE_INGREDIENTS
    await queryRunner.createForeignKey(
      `${SCHEMA_NAME}.${RECIPE_INGREDIENTS_TABLE_NAME}`,
      new TableForeignKey({
        columnNames: ['ingredient_item_id'],
        referencedColumnNames: ['id'],
        referencedTableName: ITEMS_TABLE_NAME,
        referencedSchema: SCHEMA_NAME,
        onDelete: 'RESTRICT', // No podemos borrar un Ítem que esté siendo usado como ingrediente
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NOTA: Al eliminar las tablas, las Claves Foráneas (FK) también se eliminan,
    // pero es buena práctica eliminarlas explícitamente primero.

    // Helper para obtener y eliminar FKs
    const dropForeignKeys = async (
      tableName: string,
      fkColumnNames: string[],
    ) => {
      const table = await queryRunner.getTable(`${SCHEMA_NAME}.${tableName}`)
      if (table) {
        for (const fkColName of fkColumnNames) {
          const foreignKey = table.foreignKeys.find((fk) =>
            fk.columnNames.includes(fkColName),
          )
          if (foreignKey) {
            await queryRunner.dropForeignKey(
              `${SCHEMA_NAME}.${tableName}`,
              foreignKey,
            )
          }
        }
      }
    }

    // 1. Eliminar FKs de RECIPE_INGREDIENTS
    await dropForeignKeys(RECIPE_INGREDIENTS_TABLE_NAME, [
      'recipe_id',
      'ingredient_item_id',
    ])

    // 2. Eliminar FKs de RECIPES
    await dropForeignKeys(RECIPES_TABLE_NAME, ['user_id', 'final_product_id'])

    // 3. Eliminar las tablas
    await queryRunner.dropTable(
      `${SCHEMA_NAME}.${RECIPE_INGREDIENTS_TABLE_NAME}`,
    )
    await queryRunner.dropTable(`${SCHEMA_NAME}.${RECIPES_TABLE_NAME}`)

    // No necesitamos eliminar los ENUMs aquí, ya que se usan en la tabla ITEMS que ya existe.
  }
}
