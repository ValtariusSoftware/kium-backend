import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Item } from 'src/items/entities/item.entity'
import { User, AccessLevel } from 'src/users/entities/user.entity'
import { EntitlementsService } from './entitlements.service'

@Injectable()
export class CatalogPolicyService {
  constructor(
    @InjectRepository(Item)
    private readonly itemsRepository: Repository<Item>,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  /**
   * 🛡️ Aplica la política de catálogo según el nivel al que cambia el usuario.
   * Si pasa a PRO o PRO_PLUS, destraba todo. Si baja a FREE/DEMO expirado, evalúa excedentes y bloquea.
   */
  async applyPolicyOnAccessChange(
    user: User,
    newLevel: AccessLevel,
  ): Promise<void> {
    const userId = user.id

    // Si pasa a un nivel pago (PRO o PRO_PLUS), destrabamos todos sus ítems de golpe
    if (
      newLevel === AccessLevel.PRO ||
      newLevel === AccessLevel.PRO_PLUS ||
      newLevel === AccessLevel.DEMO
    ) {
      await this.itemsRepository.update({ userId }, { isLockedByPlan: false })
      return
    }

    // Si baja a un nivel gratuito (FREE o DEMO vencido), aplicamos el límite de stock
    // Temporalmente actualizamos el nivel del usuario en el objeto para que el EntitlementsService lo evalúe bien
    const tempUser = { ...user, accessLevel: newLevel }
    const stockLimit = await this.entitlementsService.getLimit(
      tempUser,
      'stock_limit',
    )

    // Traemos todos los ítems activos ordenados por fecha de creación (los más viejos primero)
    const items = await this.itemsRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    })

    // Si supera el límite gratuito, bloqueamos los excedentes (los más nuevos)
    if (items.length > stockLimit) {
      const itemsToLock = items.slice(stockLimit)
      const lockIds = itemsToLock.map((item) => item.id)

      await this.itemsRepository
        .createQueryBuilder()
        .update()
        .set({ isLockedByPlan: true })
        .where('id IN (:...ids)', { ids: lockIds })
        .execute()
    } else {
      // Si está por debajo del límite, aseguramos que ninguno quede bloqueado por error
      await this.itemsRepository.update({ userId }, { isLockedByPlan: false })
    }
  }
}
