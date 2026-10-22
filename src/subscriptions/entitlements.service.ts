import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, AccessLevel } from 'src/users/entities/user.entity'
import { PlanFeature } from './entities/plan-feature.entity'
import { CatalogPolicyService } from './catalog-policy.service'

const DEFAULT_STOCK_LIMIT = 100
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectRepository(PlanFeature)
    private readonly planFeatureRepository: Repository<PlanFeature>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>, // 👈 Inyectamos el repo de usuarios para buscar por ID si es necesario
    @Inject(forwardRef(() => CatalogPolicyService))
    private readonly catalogPolicyService: CatalogPolicyService,
  ) {}

  /**
   * 🔍 Resuelve el nivel de acceso efectivo y SI EXPIRÓ EL DEMO, actualiza el usuario y bloquea excedentes.
   */
  async resolveEffectiveLevel(
    userOrLevel: User | AccessLevel,
  ): Promise<AccessLevel> {
    if (typeof userOrLevel === 'string') {
      return userOrLevel
    }

    // Si es un objeto User en DEMO, evaluamos si el trial expiró
    if (userOrLevel.accessLevel === AccessLevel.DEMO) {
      if (
        userOrLevel.trialEndsAt &&
        new Date() > new Date(userOrLevel.trialEndsAt)
      ) {
        // 🚨 TRANSICIÓN AUTOMÁTICA: El demo venció. Actualizamos al usuario a FREE en la BD.
        userOrLevel.accessLevel = AccessLevel.FREE
        await this.userRepository.save(userOrLevel)

        // 🛡️ Aplicamos el bloqueo de excedentes en los ítems
        await this.catalogPolicyService.applyPolicyOnAccessChange(
          userOrLevel,
          AccessLevel.FREE,
        )

        return AccessLevel.FREE
      }
    }
    return userOrLevel.accessLevel
  }

  /**
   * 📦 Obtiene un límite (ej. 'stock_limit', 'bulk_upload') aceptando:
   * - Un objeto User
   * - Un userId (string) -> busca el usuario por su ID
   * - Un AccessLevel directo
   */
  async getLimit(
    userOrIdOrLevel: User | string | AccessLevel,
    featureSlug: string,
    fallbackLimit: number = DEFAULT_STOCK_LIMIT,
  ): Promise<number> {
    let effectiveLevel: AccessLevel = AccessLevel.FREE

    if (typeof userOrIdOrLevel === 'string') {
      // Si pasaron un string, puede ser un userId o un AccessLevel ('FREE', 'PRO', etc.)
      if (Object.values(AccessLevel).includes(userOrIdOrLevel as AccessLevel)) {
        effectiveLevel = userOrIdOrLevel as AccessLevel
      } else {
        // Es un userId, lo buscamos en la base de datos
        const user = await this.userRepository.findOne({
          where: { id: userOrIdOrLevel },
        })
        if (user) {
          effectiveLevel = await this.resolveEffectiveLevel(user)
        }
      }
    } else {
      effectiveLevel = await this.resolveEffectiveLevel(userOrIdOrLevel)
    }

    try {
      const planFeature = await this.planFeatureRepository.findOne({
        where: {
          planId: effectiveLevel,
          feature: { slug: featureSlug, isActive: true },
          isEnabled: true,
        },
        relations: ['feature'],
      })

      if (
        planFeature &&
        planFeature.limits &&
        typeof planFeature.limits.max === 'number'
      ) {
        return planFeature.limits.max
      }

      return fallbackLimit
    } catch (error) {
      console.error(`Error obteniendo límite para ${featureSlug}:`, error)
      return fallbackLimit
    }
  }

  /**
   * ✅ Verifica si se puede realizar una acción
   */
  async canUserPerform(
    userOrIdOrLevel: User | string | AccessLevel,
    featureSlug: string,
  ): Promise<boolean> {
    let effectiveLevel: AccessLevel = AccessLevel.FREE

    if (typeof userOrIdOrLevel === 'string') {
      if (Object.values(AccessLevel).includes(userOrIdOrLevel as AccessLevel)) {
        effectiveLevel = userOrIdOrLevel as AccessLevel
      } else {
        const user = await this.userRepository.findOne({
          where: { id: userOrIdOrLevel },
        })
        if (user) {
          effectiveLevel = await this.resolveEffectiveLevel(user)
        }
      }
    } else {
      effectiveLevel = await this.resolveEffectiveLevel(userOrIdOrLevel)
    }

    try {
      const planFeature = await this.planFeatureRepository.findOne({
        where: {
          planId: effectiveLevel,
          feature: { slug: featureSlug, isActive: true },
        },
        relations: ['feature'],
      })

      if (!planFeature) return false
      return planFeature.isEnabled
    } catch (error) {
      console.error(`Error verificando feature ${featureSlug}:`, error)
      return false
    }
  }
}
