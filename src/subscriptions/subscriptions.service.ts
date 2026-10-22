import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { SubscriptionFeature } from './entities/subscription-feature.entity'
import { CreateSubscriptionFeatureInput } from './dto/create-subscription-feature.input'
import { UpdateSubscriptionFeatureInput } from './dto/update-subscription-feature.input'
import { SubscriptionFeatureTranslation } from './entities/subscription-feature-translation.entity'
import { SubscriptionFeatureSlug } from './enums/subscription-feature-slug.enum'
import { NotificationCampaignSlug } from 'src/notifications/enums/notification-campaign-slug.enum'
import { UserCampaignTracker } from 'src/notifications/entities/user-campaign-tracker.entity'
import { PlanFeature } from './entities/plan-feature.entity'
import {
  FREE_INFORMATIVE_FEATURES,
  SUBSCRIPTION_PLANS_METADATA,
} from './constants/free-informative.constants'

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionFeature)
    private readonly featureRepository: Repository<SubscriptionFeature>,
    @InjectRepository(PlanFeature)
    private readonly planFeatureRepository: Repository<PlanFeature>,
    @InjectRepository(UserCampaignTracker)
    private readonly trackerRepository: Repository<UserCampaignTracker>,
  ) {}
  async getSubscriptionMatrix(
    lang?: string,
    clientPlatform: 'android' | 'web' = 'android',
  ) {
    const targetLang = lang && FREE_INFORMATIVE_FEATURES[lang] ? lang : 'es'

    // 1. Traemos las características de la base de datos para todos los planes
    const planFeatures = await this.planFeatureRepository.find({
      relations: ['feature', 'feature.translations'],
      where: {
        feature: { isActive: true },
      },
      order: {
        planId: 'ASC',
        feature: { displayOrder: 'ASC' },
      },
    })

    // Agrupamos las features de la BD por planId
    const featuresByPlan = new Map<string, any[]>()
    for (const pf of planFeatures) {
      const planId = pf.planId
      if (!featuresByPlan.has(planId)) {
        featuresByPlan.set(planId, [])
      }

      let translations = pf.feature.translations
      if (targetLang) {
        translations = translations.filter((t) => t.languageCode === targetLang)
      }

      // 🎯 Extracción directa y limpia del objeto limits que ya confirmó la consola
      const limitValue =
        pf.limits && typeof pf.limits === 'object'
          ? ((pf.limits as any).max ?? null)
          : null

      featuresByPlan.get(planId)!.push({
        featureSlug: pf.feature.slug,
        isEnabled: pf.isEnabled,
        limitMax: limitValue, // 👈 Aquí se inyecta directo el 100 o 3000
        displayOrder: pf.feature.displayOrder,
        translations,
      })
    }

    const plansMatrix: any[] = []

    // 2. Iteramos sobre las keys de la lista blanca oficial (PRO_PLUS, PRO, FREE)
    for (const planId of Object.keys(SUBSCRIPTION_PLANS_METADATA)) {
      const metadata = SUBSCRIPTION_PLANS_METADATA[planId]

      const resolvedOrder =
        clientPlatform === 'web'
          ? metadata.displayOrderWeb
          : metadata.displayOrderAndroid

      const planName =
        metadata.name[targetLang] || metadata.name['es'] || planId
      const planDescription =
        metadata.description[targetLang] || metadata.description['es'] || ''
      const planPeriod =
        metadata.periodSuffix[targetLang] ||
        metadata.periodSuffix['es'] ||
        '/mes'

      let planFeatureList = featuresByPlan.get(planId) || []

      // 🚀 SI ES EL PLAN FREE: Inyectamos las viñetas informativas manteniendo las de la BD (con su stock_limit de 100)
      if (planId === 'FREE') {
        const informativeTexts =
          FREE_INFORMATIVE_FEATURES[targetLang] ||
          FREE_INFORMATIVE_FEATURES['es']

        const informativeFeaturesAsItems = informativeTexts.map(
          (text, index) => ({
            featureSlug: `free_info_${index}`,
            isEnabled: true,
            limitMax: null,
            displayOrder: index - 10,
            translations: [
              {
                languageCode: targetLang,
                name: text,
              },
            ],
          }),
        )

        // Combinamos las viñetas informativas + las features reales de la BD (donde viaja el stock_limit con su 100)
        planFeatureList = [...planFeatureList, ...informativeFeaturesAsItems]
      }

      plansMatrix.push({
        id: planId,
        productId: metadata.productId,
        name: planName,
        description: planDescription,
        priceDisplay: metadata.priceDisplay,
        periodSuffix: planPeriod,
        displayOrder: resolvedOrder,
        features: planFeatureList,
      })
    }

    // 3. Ordenamos según el displayOrder correspondiente
    const sortedPlans = plansMatrix.sort(
      (a, b) => a.displayOrder - b.displayOrder,
    )

    return {
      plansMatrix: sortedPlans,
      freeInformativeFeatures: FREE_INFORMATIVE_FEATURES[targetLang] || [],
    }
  }

  async getLatestUpdate(): Promise<Date> {
    // Usamos find() con limit 1 en lugar de findOne para evitar la restricción del 'where'
    const latest = await this.featureRepository.find({
      order: { updatedAt: 'DESC' },
      take: 1,
    })

    // latest es un array, así que verificamos el primer elemento
    return latest.length > 0 ? latest[0].updatedAt : new Date()
  }

  async findByLanguage(lang: string) {
    return this.featureRepository
      .createQueryBuilder('feature')
      .leftJoinAndSelect(
        'feature.translations',
        'translation',
        'translation.languageCode = :lang',
        { lang },
      )
      .where('feature.isActive = :active', { active: true })
      .orderBy('feature.displayOrder', 'ASC')
      .getMany()
  }

  async createMany(
    inputs: CreateSubscriptionFeatureInput[],
  ): Promise<SubscriptionFeature[]> {
    // El método save() es capaz de procesar el objeto plano y aplicar la cascada
    // siempre y cuando la entidad tenga definido 'cascade: true'.
    return this.featureRepository.save(inputs)
  }

  async updateMany(
    inputs: UpdateSubscriptionFeatureInput[],
  ): Promise<SubscriptionFeature[]> {
    const queryRunner =
      this.featureRepository.manager.connection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const updatedFeatures: SubscriptionFeature[] = []

      for (const input of inputs) {
        const { id, translations, ...featureData } = input

        const existingFeature = await queryRunner.manager.findOne(
          SubscriptionFeature,
          {
            where: { id },
          },
        )

        if (!existingFeature) continue

        // 🛡️ VALIDACIÓN CRÍTICA: Bloquear cambio de Slug
        if (featureData.slug && featureData.slug !== existingFeature.slug) {
          throw new BadRequestException(
            `No se permite cambiar el slug de la feature '${existingFeature.slug}'. Esto rompería la lógica de la App Android.`,
          )
        }

        if (translations && translations.length > 0) {
          await queryRunner.manager.delete(SubscriptionFeatureTranslation, {
            featureId: id,
          })

          const newTranslations = translations.map((t) => ({
            ...t,
            featureId: id,
          }))

          ;(featureData as any).translations = newTranslations
        }

        // 2. FORZAR ACTUALIZACIÓN DE FECHA
        // Al setear updatedAt en la fecha actual manualmente, nos aseguramos
        // de que el getLatestUpdate funcione, incluso si TypeORM se pone "vago".
        const now = new Date()
        // Al usar PartialType y el spread, solo se actualizarán los campos presentes en featureData
        await queryRunner.manager.save(SubscriptionFeature, {
          ...existingFeature,
          ...featureData,
          updatedAt: now,
        })

        const fullUpdated = await queryRunner.manager.findOne(
          SubscriptionFeature,
          {
            where: { id },
            relations: ['translations'],
          },
        )

        if (fullUpdated) updatedFeatures.push(fullUpdated)
      }

      await queryRunner.commitTransaction()
      return updatedFeatures
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  async removeMany(ids: string[]): Promise<boolean> {
    // Buscamos las entidades para conocer sus slugs
    const featuresToDelete = await this.featureRepository.find({
      where: { id: In(ids) },
    })

    if (featuresToDelete.length === 0) return false

    // Obtenemos todos los slugs protegidos desde el Enum de TS
    const protectedSlugs: string[] = Object.values(SubscriptionFeatureSlug)

    const protectedFound = featuresToDelete.find((f) =>
      protectedSlugs.includes(f.slug as any),
    )

    if (protectedFound) {
      throw new BadRequestException(
        `No se puede eliminar la feature '${protectedFound.slug}' porque es estructural. Usá 'isActive: false' si necesitás ocultarla.`,
      )
    }

    // 2. Realizamos el borrado físico
    const deleteResult = await this.featureRepository.delete({ id: In(ids) })

    // 3. 🚨 DISPARADOR DE SYNC: Actualizar la fecha global
    if (deleteResult.affected && deleteResult.affected > 0) {
      // Buscamos el ID de cualquier feature que haya quedado activa
      const remainingFeature = await this.featureRepository.findOne({
        where: { isActive: true },
        select: ['id'],
      })

      if (remainingFeature) {
        // 🚀 CORRECCIÓN: Actualizamos sin .limit() para evitar el error de Postgres
        await this.featureRepository.update(remainingFeature.id, {
          updatedAt: new Date(),
        })

        console.log(
          '✅ Fecha global de manifest actualizada vía feature ID:',
          remainingFeature.id,
        )
      }
    }

    return (deleteResult.affected ?? 0) > 0
  }
  async trackSubscriptionView(userId: string): Promise<boolean> {
    await this.trackerRepository.upsert(
      {
        userId: userId,
        campaignSlug: NotificationCampaignSlug.SUB_RETARGETING,
        lastTriggeredAt: new Date(),
        lastNotifiedAt: null,
      },
      ['userId', 'campaignSlug'],
    )
    return true
  }
}
