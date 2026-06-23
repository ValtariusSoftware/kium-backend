import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveField,
  Parent,
  ID,
  Context,
  Float,
} from '@nestjs/graphql'
import { ItemsService } from './items.service'
import { Item } from './entities/item.entity'
import { BulkItemResponse, CreateItemInput } from './dto/create-item.dto'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { ItemsFilterInput } from './dto/items-filter.input'
import {
  BulkUpdateItemInput,
  ReconfigureItemInput,
  ReconfigureItemResponse,
  UpdateItemInput,
} from './dto/update-item.input'
import { PaginatedItems } from './types/paginated-items.type'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { RecipesLoader } from 'src/recipes/recipes.loader'
import { Recipe } from 'src/recipes/entities/recipe.entity'
import { RecipesService } from 'src/recipes/recipes.service'
import { InventoryTransactionsService } from 'src/inventory-transactions/inventory-transactions.service'
import { ExcelParserService } from 'src/excel/excel-parser.service'
import { GraphQLUpload, FileUpload } from 'graphql-upload-ts'
import { getProductTemplateConfig } from 'src/excel/excel.template.config'
import { ExcelService } from 'src/excel/excel.service'
import { EXCEL_HEADERS } from 'src/common/i18n/excel-headers'

@Resolver(() => Item)
export class ItemsResolver {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly excelParserService: ExcelParserService,
    private readonly recipesService: RecipesService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly excelService: ExcelService,
  ) {}

  @Mutation(() => Item)
  async createItem(
    @Args('createItemInput') createItemInput: CreateItemInput,
    @CurrentUser() user: User, // Decora para obtener el objeto User (con ID y accessLevel)
  ): Promise<Item> {
    // El Service se encarga de aplicar el límite FREE/PRO
    return this.itemsService.create(user.id, user.accessLevel, createItemInput)
  }

  @Query(() => PaginatedItems, { name: 'items' }) // <--- Ahora devuelve la "caja"
  async getItems(
    @CurrentUser() user: User,
    @Args('filters', { nullable: true }) filters?: ItemsFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput, // Tu DTO
  ): Promise<PaginatedItems> {
    return this.itemsService.getItems(user.id, filters, pagination)
  }

  @Query(() => Item, { name: 'item', nullable: true })
  async findOne(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<Item | null> {
    return this.itemsService.findOne(id, user.id)
  }

  @Query(() => PaginatedItems, { name: 'lowStockReport' })
  async getLowStockReport(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedItems> {
    return this.itemsService.getLowStockItems(user.id, pagination)
  }

  @ResolveField(() => Recipe, { nullable: true })
  async recipe(
    @Parent() item: Item,
    @Context('recipesLoader') recipesLoader: RecipesLoader,
    @CurrentUser() user: User, // Agregamos el usuario
  ): Promise<Recipe | null> {
    if (!item.isProduced) return null

    // Si el loader existe, lo usamos (Eficiencia)
    if (recipesLoader) {
      return recipesLoader.load(item.id)
    }

    // Plan B: Si el loader es null, vamos directo al service (Seguridad)
    return this.recipesService.findByFinalProductId(item.id, user.id)
  }

  // Buscar un producto por código de barras (Rápido para el escáner)
  @Query(() => Item, { name: 'getItemByBarcode', nullable: true })
  async getByBarcode(
    @Args('barcode') barcode: string,
    @CurrentUser() user: User,
  ): Promise<Item | null> {
    return this.itemsService.findByBarcode(user.id, barcode)
  }

  @Mutation(() => Item)
  async updateItem(
    @Args('updateItemInput') updateItemInput: UpdateItemInput,
    @CurrentUser() user: User,
  ): Promise<Item> {
    return this.itemsService.update(user.id, updateItemInput)
  }

  /*  @Mutation(() => BulkItemResponse, { name: 'createItemsBulk' }) // <--- Cambio aquí
  async createItemsBulk(
    @Args('inputs', { type: () => [CreateItemInput] })
    inputs: CreateItemInput[],
    @CurrentUser() user: User,
  ): Promise<BulkItemResponse> {
    // <--- Y aquí
    return this.itemsService.createBulk(user.id, user.accessLevel, inputs)
  }*/

  @Mutation(() => BulkItemResponse)
  async uploadBulkProducts(
    @Args({ name: 'file', type: () => GraphQLUpload }) file: FileUpload,
    @CurrentUser() user: User,
  ): Promise<BulkItemResponse> {
    const { createReadStream } = await file

    // 1. Consumo del stream del archivo
    const chunks: Buffer[] = []
    for await (const chunk of createReadStream()) {
      chunks.push(chunk as Buffer)
    }
    const buffer = Buffer.concat(chunks)

    // 2. Parseo (aquí ya tienes la lógica de carga parcial con errores de formato)
    const { items, errors: parserErrors } =
      await this.excelParserService.parse(buffer)

    // 3. Ejecutar la lógica de negocio (aquí valida límites, duplicados en DB, etc.)
    // Usamos el método real que me pasaste:
    const result = await this.itemsService.createBulk(
      user.id,
      user.accessLevel,
      items,
    )

    // 4. Combinamos los errores del parseo inicial con los errores de la DB
    // Nota: El parser marca la fila original (i+1), el servicio marca el error de DB.
    return {
      created: result.created,
      errors: [...parserErrors, ...result.errors],
    }
  }

  @Mutation(() => Boolean, {
    name: 'removeItem',
    description: 'Realiza un borrado lógico de un ítem',
  })
  async removeItem(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User, // Tu decorador de usuario autenticado
  ): Promise<boolean> {
    return this.itemsService.remove(id, user.id)
  }

  // Mutación para Borrado Masivo
  @Mutation(() => Boolean, { name: 'removeItemsBulk' })
  async removeItemsBulk(
    @Args('ids', { type: () => [ID] }) ids: string[],
    @CurrentUser() user: User,
  ): Promise<boolean> {
    return this.itemsService.removeBulk(user.id, user.accessLevel, ids)
  }

  // Mutación para Actualización Masiva
  @Mutation(() => [Item], { name: 'updateItemsBulk' })
  async updateItemsBulk(
    @Args('inputs', { type: () => [BulkUpdateItemInput] })
    inputs: BulkUpdateItemInput[],
    @CurrentUser() user: User,
  ): Promise<Item[]> {
    return this.itemsService.updateBulk(user.id, user.accessLevel, inputs)
  }

  @ResolveField(() => Float)
  async canProduceQuantity(
    @Parent() item: Item,
    @Context('recipesLoader') recipesLoader: RecipesLoader,
    @CurrentUser() user: User, // <-- Necesitamos el usuario para el plan B
  ): Promise<number> {
    if (!item.isProduced) return 0

    let recipe: Recipe | null = null

    if (recipesLoader) {
      recipe = await recipesLoader.load(item.id)
    } else {
      // Plan B: Usamos el nombre correcto del método y pasamos el userId
      recipe = await this.recipesService.findByFinalProductId(item.id, user.id)
    }

    if (!recipe) return 0

    return this.recipesService.runVirtualStockMath(recipe)
  }

  @ResolveField(() => Float)
  async totalAvailableStock(
    @Parent() item: Item,
    @Context('recipesLoader') recipesLoader: RecipesLoader,
    @CurrentUser() user: User, // <-- Lo mismo aquí
  ): Promise<number> {
    let virtual = 0

    if (item.isProduced) {
      let recipe: Recipe | null = null

      if (recipesLoader) {
        recipe = await recipesLoader.load(item.id)
      } else {
        recipe = await this.recipesService.findByFinalProductId(
          item.id,
          user.id,
        )
      }

      if (recipe) {
        virtual = this.recipesService.runVirtualStockMath(recipe)
      }
    }

    return Number(item.stock) + virtual
  }
  // Lógica para determinar si el ítem tiene historial (bloqueo de UI)
  @ResolveField(() => Boolean)
  async hasOperationalHistory(
    @Parent() item: Item,
    @CurrentUser() user: User,
  ): Promise<boolean> {
    // Forzamos la espera del resultado
    const hasHistory =
      await this.inventoryTransactionsService.hasOperationalHistory(
        user.id,
        item.id,
      )
    // console.log(`[DEBUG] Item: ${item.name}, HasHistory: ${hasHistory}`) // Agregá este log para ver qué pasa en consola
    return hasHistory
  }

  // Mutation para cambiar unidad base/factor o clonar
  @Mutation(() => ReconfigureItemResponse)
  async changeItemStructure(
    @Args('input') input: ReconfigureItemInput,
    @CurrentUser() user: User,
  ): Promise<ReconfigureItemResponse> {
    // <--- AQUÍ EL CAMBIO
    return this.itemsService.changeItemStructure(user.id, input)
  }

  @Mutation(() => Item, { name: 'verifyItemStructure' })
  async verifyItemStructure(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<Item> {
    return this.itemsService.verifyItem(user.id, id)
  }

  @Mutation(() => String)
  async getTemplate(
    @Args('lang') lang: string,
    @CurrentUser() user: User, // <--- Agregamos esto
  ): Promise<string> {
    console.log(user)
    console.log('Idioma recibido:', lang)
    console.log('Cabecera disponible:', EXCEL_HEADERS.name)
    const columnConfig = getProductTemplateConfig(lang)
    return await this.excelService.generate(columnConfig, lang)
  }
}
