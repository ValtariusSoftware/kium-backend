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
import { AccessLevel } from 'src/users/entities/user.entity'

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionFeature)
    private readonly featureRepository: Repository<SubscriptionFeature>,

    @InjectRepository(UserCampaignTracker)
    private readonly trackerRepository: Repository<UserCampaignTracker>,
  ) {}

  async findAll() {
    // Traemos TODAS las features activas con TODAS sus traducciones
    const features = await this.featureRepository.find({
      where: { isActive: true },
      relations: ['translations'],
      order: { displayOrder: 'ASC' },
    })

    // Opcional: Validación de integridad en el servidor
    // Si querés que el backend grite si falta el inglés (tu fallback original)
    features.forEach((feature) => {
      const hasEnglish = feature.translations.some(
        (t) => t.languageCode === 'en',
      )
      if (!hasEnglish) {
        console.warn(
          `⚠️ Feature ${feature.slug} no tiene traducción al inglés. Esto romperá el fallback en la App.`,
        )
      }
    })

    return features
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

  private readonly FALLBACK_LIMITS: Record<string, Record<string, number>> = {
    [SubscriptionFeatureSlug.STOCK_LIMIT]: { FREE: 25, PRO: 1200 },
    [SubscriptionFeatureSlug.MULTI_PRODUCT_UPDATE]: { FREE: 0, PRO: 100 },
    [SubscriptionFeatureSlug.MULTI_PRODUCT_DELETION]: { FREE: 0, PRO: 100 },
    [SubscriptionFeatureSlug.BULK_UPLOAD]: { FREE: 10, PRO: 100 }, // El que usaste como string
  }

  async getLimit(slug: string, accessLevel: AccessLevel): Promise<number> {
    try {
      const feature = await this.featureRepository.findOne({
        where: { slug, isActive: true },
      })
      if (feature && feature.limits) {
        return (
          feature.limits[accessLevel] ?? this.FALLBACK_LIMITS[slug][accessLevel]
        )
      }
      return this.FALLBACK_LIMITS[slug][accessLevel]
    } catch (error) {
      console.log(error)
      return this.FALLBACK_LIMITS[slug][accessLevel]
    }
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

  // 2. Tarea Automática (Monitorea la DB cada minuto)
  // @Cron(CronExpression.EVERY_MINUTE) // 👈 Mantener cada minuto para testear
  // async handleSubscriptionRetargeting() {
  //   this.logger.log(
  //     'Ejecutando retargeting dinámico multi-idioma de suscripciones...',
  //   )

  //   // Simulamos el desfasaje de tiempo para las pruebas
  //   const testTimeGap = new Date(Date.now() - 1 * 60 * 1000)

  //   // 1. Buscamos los usuarios que cumplen las condiciones del retargeting
  //   const candidates = await this.usersRepository.find({
  //     where: {
  //       accessLevel: AccessLevel.FREE,
  //       lastSubscriptionView: LessThan(testTimeGap),
  //     },
  //   })

  //   if (candidates.length === 0) {
  //     this.logger.log(
  //       'No se encontraron usuarios candidatos para retargeting en este minuto.',
  //     )
  //     return
  //   }

  //   // 2. 💎 Traemos la campaña 'sub_retargeting' activa junto con todas sus traducciones
  //   const campaign = await this.campaignRepository.findOne({
  //     where: { slug: 'sub_retargeting', isActive: true },
  //     relations: ['translations'],
  //   })

  //   if (!campaign) {
  //     this.logger.warn(
  //       '⚠️ La campaña "sub_retargeting" no está disponible o está inactiva en la base de datos.',
  //     )
  //     return
  //   }

  //   this.logger.log(
  //     `Procesando envío personalizado para ${candidates.length} usuario(s).`,
  //   )

  //   // 3. Iteramos por cada usuario aplicando su idioma nativo o el fallback
  //   for (const user of candidates) {
  //     const userLang = user.language || 'en' // 'en' como resguardo definitivo si el campo es nulo

  //     // Buscamos la traducción exacta que guardamos para el idioma del usuario
  //     let translation = campaign.translations.find(
  //       (t) => t.languageCode === userLang,
  //     )

  //     // 💡 Fallback inteligente: si por alguna razón el usuario tiene un idioma que no cargamos, usamos inglés
  //     if (!translation) {
  //       this.logger.warn(
  //         `Traducción no encontrada para [${userLang}]. Aplicando fallback a inglés.`,
  //       )
  //       translation = campaign.translations.find((t) => t.languageCode === 'en')
  //     }

  //     if (!translation) {
  //       this.logger.error(
  //         `❌ Error crítico: No se encontró traducción ni en [${userLang}] ni en inglés para la campaña.`,
  //       )
  //       continue
  //     }

  //     this.logger.log(
  //       `🚀 Enviando Push en idioma [${userLang}] al usuario: ${user.username}`,
  //     )

  //     // Despachamos la notificación con el título y cuerpo recuperados de forma dinámica
  //     await this.notificationsService.sendPushNotification(
  //       user.fcmTokens,
  //       translation.title,
  //       translation.body,
  //     )

  //     // Limpiamos la fecha en la DB para que no vuelva a entrar en el loop en el próximo minuto
  //     await this.usersRepository.update(user.id, {
  //       lastSubscriptionView: () => 'NULL',
  //     })
  //   }
  // }
}
