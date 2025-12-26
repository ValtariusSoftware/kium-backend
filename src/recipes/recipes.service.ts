import {
  Injectable,
  BadRequestException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Recipe } from './entities/recipe.entity'
import { CreateRecipeInput } from './dto/create-recipe.dto'
import { ItemsService } from '../items/items.service'
import { ItemType } from '../items/entities/item.entity'

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe)
    private recipesRepository: Repository<Recipe>,
    @Inject(forwardRef(() => ItemsService))
    private itemsService: ItemsService,
  ) {}

  /**
   * Crea una nueva receta, validando que el producto final exista y sea del tipo correcto.
   */
  async create(
    userId: string,
    createRecipeInput: CreateRecipeInput,
  ): Promise<Recipe> {
    const { finalProductId, ingredients } = createRecipeInput

    // 1. Validar que el finalProductId exista y sea de tipo FINAL_PRODUCT
    const finalProductItem = await this.itemsService.findOne(
      finalProductId,
      userId,
    )

    if (!finalProductItem) {
      throw new NotFoundException(
        `Item con ID ${finalProductId} no encontrado.`,
      )
    }

    if (finalProductItem.type !== ItemType.FINAL_PRODUCT) {
      throw new BadRequestException(
        `El ítem ${finalProductItem.name} debe ser de tipo FINAL_PRODUCT para tener una receta.`,
      )
    }

    // 2. Validar que el finalProductId no tenga ya una receta
    const existingRecipe = await this.recipesRepository.findOne({
      where: { finalProductId },
    })
    if (existingRecipe) {
      throw new BadRequestException(
        `El producto ${finalProductItem.name} ya tiene una receta asociada.`,
      )
    }

    // 3. Crear el objeto Recipe con las relaciones anidadas
    const newRecipe = this.recipesRepository.create({
      userId,
      finalProductId,
      yieldQuantity: createRecipeInput.yieldQuantity,
      // Mapear los DTOs de ingredientes a entidades
      ingredients: ingredients.map((ing) => ({
        ingredientItemId: ing.ingredientItemId,
        quantityRequired: ing.quantityRequired,
        unitOfMeasure: ing.unitOfMeasure,
      })),
    })

    // TypeORM guardará la Receta y los RecipeIngredients en cascada (gracias al decorador cascade: ['insert'])
    return this.recipesRepository.save(newRecipe)
  }

  // Método para obtener una receta por ID de Producto Final
  async findByFinalProductId(
    finalProductId: string,
    userId: string,
  ): Promise<Recipe | null> {
    const recipe = await this.recipesRepository.findOne({
      where: { finalProductId, userId },
      relations: ['ingredients', 'ingredients.ingredientItem'], // Cargar ingredientes y los detalles del ítem ingrediente
    })

    return recipe
  }

  /**
   * Obtiene una receta por su ID de Receta, asegurando que pertenezca al usuario,
   * y cargando sus ingredientes y el item final.
   */
  async findOne(recipeId: string, userId: string): Promise<Recipe | null> {
    const recipe = await this.recipesRepository.findOne({
      where: { id: recipeId, userId },
      relations: [
        'ingredients',
        'ingredients.ingredientItem', // <-- ¡CORREGIDO! Usar el nombre de la relación
        'finalProduct',
      ],
    })

    return recipe || null
  }
}
