import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common'
import { ProductType } from './enums/product-type'
import { ItemErrorCode } from './enums/item-error-code.enum'
import { CreateItemInput } from './dto/create-item.dto'
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service'
import { AccessLevel } from 'src/users/entities/user.entity'
import { SubscriptionFeatureSlug } from 'src/subscriptions/enums/subscription-feature-slug.enum'
import { Item } from './entities/item.entity'

interface DatabaseError extends Error {
  code?: string
  detail?: string
}

@Injectable()
export class ItemsDomainService {
  constructor(
    @Inject(forwardRef(() => SubscriptionsService)) // <-- Si te da error, añade esto
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Determina si un ítem es considerado un borrador operativo según su tipo y precios.
   */
  calculateIsDraft(input: CreateItemInput): boolean {
    const {
      productType = ProductType.RESALE,
      costPrice = 0,
      salePrice = 0,
    } = input
    const cost = costPrice ?? 0
    const sale = salePrice ?? 0

    switch (productType) {
      case ProductType.HYBRID:
      case ProductType.RESALE:
        return cost <= 0 || sale <= 0 // Necesita ambos precios
      case ProductType.PRODUCED_FINAL:
        return sale <= 0 // Solo necesita precio de venta
      case ProductType.PURCHASED_INGREDIENT:
        return cost <= 0 // Solo necesita precio de costo
      case ProductType.PRODUCED_INGREDIENT:
        return false // Los insumos producidos no requieren precios iniciales obligatorios
      default:
        return true
    }
  }

  /**
   * Infiere roles basados en precios y estado actual.
   * @param costPrice Precio de costo actual o nuevo
   * @param salePrice Precio de venta actual o nuevo
   * @param currentItem (Opcional) Estado actual del ítem en DB para no pisar flags de recetas
   */
  calculateItemRoles(input: CreateItemInput, currentItem?: Item) {
    // Si no viene productType, usamos RESALE por defecto
    const {
      // costPrice,
      salePrice,
      productType = ProductType.RESALE,
    } = input
    // const hasCost = !!costPrice && costPrice > 0
    const hasSale = !!salePrice && salePrice > 0

    // BLOQUEO DE SEGURIDAD: Si el ítem ya existe, NO recalculamos roles basados en tipo.
    // Solo actualizamos si es vendible o no basado en el precio de venta.
    if (currentItem) {
      return {
        isSaleable: hasSale, // Esto puede cambiar (dejas de venderlo o empezas a venderlo)
        isPurchasable: currentItem.isPurchasable, // SE MANTIENE
        isIngredient: currentItem.isIngredient, // SE MANTIENE
        isProduced: currentItem.isProduced, // SE MANTIENE
        isDraft: currentItem.isDraft,
      }
    }

    // Lógica para ítems NUEVOS (donde sí definimos la naturaleza por primera vez)
    return {
      isSaleable: [
        ProductType.RESALE,
        ProductType.PRODUCED_FINAL,
        ProductType.HYBRID,
      ].includes(productType),
      isProduced: [
        ProductType.PRODUCED_FINAL,
        ProductType.PRODUCED_INGREDIENT,
      ].includes(productType),
      isPurchasable: [
        ProductType.RESALE,
        ProductType.PURCHASED_INGREDIENT,
        ProductType.HYBRID,
      ].includes(productType),
      isIngredient: [
        ProductType.PURCHASED_INGREDIENT,
        ProductType.PRODUCED_INGREDIENT,
        ProductType.HYBRID,
      ].includes(productType),
      isDraft: this.calculateIsDraft(input), // 💡 Asignamos el estado de borrador calculado
    }
  }
  /**
   * Captura errores específicos de la base de datos (Postgres)
   * y los transforma en excepciones amigables para el usuario.
   */

  handleDuplicateError(err: unknown) {
    const error = err as DatabaseError
    if (error.code === '23505') {
      const detail = error.detail?.toLowerCase() || ''
      if (detail.includes('sku'))
        throw new ConflictException(ItemErrorCode.DUPLICATE_SKU)
      if (detail.includes('barcode'))
        throw new ConflictException(ItemErrorCode.DUPLICATE_BARCODE)

      throw new ConflictException(ItemErrorCode.DUPLICATE_ENTRY)
    }
  }
  validateItemIntegrity(input: CreateItemInput) {
    const { productType, costPrice, salePrice, stock } = input

    const hasCost = (costPrice ?? 0) > 0
    const hasSale = (salePrice ?? 0) > 0
    const hasStock = (stock ?? 0) > 0

    switch (productType) {
      case ProductType.RESALE:
      case ProductType.HYBRID:
        // Caso más flexible: permite todo.
        break

      case ProductType.PURCHASED_INGREDIENT:
        if (hasSale)
          throw new BadRequestException(ItemErrorCode.INVALID_SALE_PRICE)
        break

      case ProductType.PRODUCED_FINAL:
        if (hasCost)
          throw new BadRequestException(ItemErrorCode.INVALID_COST_PRICE)
        if (hasStock)
          throw new BadRequestException(
            ItemErrorCode.ERR_PRODUCED_ITEM_CANNOT_HAVE_STOCK,
          )
        break

      case ProductType.PRODUCED_INGREDIENT:
        if (hasCost)
          throw new BadRequestException(ItemErrorCode.INVALID_COST_PRICE)
        if (hasSale)
          throw new BadRequestException(ItemErrorCode.INVALID_SALE_PRICE)
        if (hasStock)
          throw new BadRequestException(
            ItemErrorCode.ERR_PRODUCED_ITEM_CANNOT_HAVE_STOCK,
          )
        break

      default:
        throw new BadRequestException(ItemErrorCode.INTERNAL_ERROR)
    }
  }

  // Consulta al servicio de suscripciones cuánto es el máximo de ítems que el usuario puede subir en una sola solicitud (el "lote")
  async validateBulkCapacity(
    userId: string,
    accessLevel: AccessLevel,
    itemsCount: number,
  ): Promise<void> {
    const batchLimit = await this.subscriptionsService.getLimit(
      SubscriptionFeatureSlug.BULK_UPLOAD,
      accessLevel,
    )
    if (itemsCount > batchLimit) {
      throw new Error(ItemErrorCode.BATCH_LIMIT_EXCEEDED)
    }
  }

  parsePostgresError(err: any): string {
    if (err.code === '23505') {
      const detail = err.detail?.toLowerCase() || ''
      if (detail.includes('sku')) return ItemErrorCode.DUPLICATE_SKU
      if (detail.includes('barcode')) return ItemErrorCode.DUPLICATE_BARCODE
      if (detail.includes('name')) return ItemErrorCode.DUPLICATE_ENTRY
      return ItemErrorCode.DUPLICATE_ENTRY
    }
    return err.message || ItemErrorCode.INTERNAL_ERROR
  }
}
