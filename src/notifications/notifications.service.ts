import { BadRequestException, Injectable, Inject, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, LessThan, IsNull } from 'typeorm'
import { Cron } from '@nestjs/schedule'
import * as admin from 'firebase-admin'

import { NotificationCampaign } from './entities/notification-campaign.entity'
import { NotificationCampaignTranslation } from './entities/notification-campaign-translation.entity'
import { User, AccessLevel } from 'src/users/entities/user.entity'
import { CreateNotificationCampaignInput } from './dto/create-notification-campaign.input'
import { UpdateNotificationCampaignInput } from './dto/update-notification-campaign.input'
import { UserNotificationPreference } from './entities/user-notification-preference.entity'
import { NotificationCampaignSlug } from './enums/notification-campaign-slug.enum'
import { UserCampaignTracker } from './entities/user-campaign-tracker.entity'
import { DashboardService } from 'src/dashboard/dashboard.service'

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseApp: admin.app.App,
    @InjectRepository(NotificationCampaign)
    private readonly campaignRepository: Repository<NotificationCampaign>,
    // Agregá esto al constructor junto a los repositorios que ya tenés:
    @InjectRepository(UserNotificationPreference)
    private readonly userPreferenceRepository: Repository<UserNotificationPreference>,
    @InjectRepository(UserCampaignTracker)
    private readonly trackerRepository: Repository<UserCampaignTracker>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dashboardService: DashboardService,
  ) {}

  // --- 🔴 ENVÍO FIREBASE ---
  async sendPushNotification(
    tokens: string[],
    title: string,
    body: string,
    destination?: string,
  ) {
    if (!tokens || tokens.length === 0) return

    const message: admin.messaging.MulticastMessage = {
      // 💎 CLAVE 1: Eliminamos el objeto "notification" raíz.
      // Usamos "data" para que el método onMessageReceived de Android tome el 100% del control.
      data: {
        title: title,
        body: body,
        ...(destination && { destination }),
      },
      tokens: tokens,
      android: {
        priority: 'high', // Mantiene la prioridad máxima de entrega
      },
    }

    try {
      const response = await this.firebaseApp
        .messaging()
        .sendEachForMulticast(message)
      console.log(`${response.successCount} notificaciones enviadas con éxito`)
    } catch (error) {
      console.error('Error enviando notificaciones:', error)
    }
  }

  // --- 🔴 ABM ADMINISTRATIVO (PLAYGROUND / ADMIN) ---
  async findAll(): Promise<NotificationCampaign[]> {
    return this.campaignRepository.find({
      relations: ['translations'],
    })
  }

  async createMany(
    inputs: CreateNotificationCampaignInput[],
  ): Promise<NotificationCampaign[]> {
    return this.campaignRepository.save(inputs)
  }

  async updateMany(
    inputs: UpdateNotificationCampaignInput[],
  ): Promise<NotificationCampaign[]> {
    const queryRunner =
      this.campaignRepository.manager.connection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const updatedCampaigns: NotificationCampaign[] = []

      for (const input of inputs) {
        const { id, translations, ...campaignData } = input

        const existingCampaign = await queryRunner.manager.findOne(
          NotificationCampaign,
          {
            where: { id },
          },
        )

        if (!existingCampaign) continue

        // Validamos que no alteren el slug (rompería scripts de negocio)
        if (campaignData.slug && campaignData.slug !== existingCampaign.slug) {
          throw new BadRequestException(
            `No se permite cambiar el slug '${existingCampaign.slug}'. Rompería la lógica automatizada del backend.`,
          )
        }

        // Si mandan traducciones nuevas, limpiamos las viejas y metemos las nuevas en cascada
        if (translations && translations.length > 0) {
          await queryRunner.manager.delete(NotificationCampaignTranslation, {
            campaignId: id,
          })

          const newTranslations = translations.map((t) => ({
            ...t,
            campaignId: id,
          }))
          ;(campaignData as any).translations = newTranslations
        }

        await queryRunner.manager.save(NotificationCampaign, {
          ...existingCampaign,
          ...campaignData,
          updatedAt: new Date(),
        })

        const fullUpdated = await queryRunner.manager.findOne(
          NotificationCampaign,
          {
            where: { id },
            relations: ['translations'],
          },
        )

        if (fullUpdated) updatedCampaigns.push(fullUpdated)
      }

      await queryRunner.commitTransaction()
      return updatedCampaigns
    } catch (err) {
      await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }
  }

  async removeMany(ids: string[]): Promise<boolean> {
    const campaignsToDelete = await this.campaignRepository.find({
      where: { id: In(ids) },
    })

    if (campaignsToDelete.length === 0) return false

    // Obtenemos los slugs fijos ('sub_retargeting', etc.) del nuevo enum
    const protectedSlugs: string[] = Object.values(NotificationCampaignSlug)

    const protectedFound = campaignsToDelete.find((c) =>
      protectedSlugs.includes(c.slug),
    )

    if (protectedFound) {
      throw new BadRequestException(
        `No se puede eliminar la campaña '${protectedFound.slug}' porque es estructural de Kium. Desactivala con isActive: false si es necesario.`,
      )
    }

    const deleteResult = await this.campaignRepository.delete({ id: In(ids) })
    return (deleteResult.affected ?? 0) > 0
  }

  // =========================================================================
  // --- 🔵 AUTOMATIZACIÓN 1: RETARGETING DE SUSCRIPCIÓN ---
  // =========================================================================

  // 🧪 ESCENARIO A (Inmediatez - Comentado): Corre cada minuto, Gap de 1 min.
  // @Cron(CronExpression.EVERY_MINUTE)

  // 🚀 ESCENARIO C (Producción - Comentado): Corre a las 10:00 AM diario, Gap de 24 hs.
  // @Cron('0 10 * * *')

  // 🔍 ESCENARIO B (Prueba Media - ACTIVO): Corre exactamente cada 1 hora buscando impactos de hace 1 hora.
  @Cron('0 * * * *') // ⏳ Se ejecuta al minuto 0 de cada 1 hora
  async handleSubscriptionRetargeting() {
    this.logger.log('Ejecutando motor de retargeting escalable...')

    // --- VARIABLES DE TIEMPO SEGÚN ESCENARIO ---
    // Inmediatez: 1 * 60 * 1000 (1 Minuto)
    // Prueba Media: 1 * 60 * 60 * 1000 (2 Horas)
    // Producción: 24 * 60 * 60 * 1000 (24 Horas)
    const TIME_GAP_MS = 1 * 60 * 60 * 1000
    const testTimeGap = new Date(Date.now() - TIME_GAP_MS)

    // 1. Buscamos impactos pendientes en la nueva tabla intermedia
    const pendingTrackers = await this.trackerRepository.find({
      where: {
        campaignSlug: NotificationCampaignSlug.SUB_RETARGETING,
        lastTriggeredAt: LessThan(testTimeGap),
        lastNotifiedAt: IsNull(), // Significa que está pendiente de envío
      },
    })

    if (pendingTrackers.length === 0) return

    // 2. Traemos la campaña activa con sus traducciones
    const campaign = await this.campaignRepository.findOne({
      where: { slug: NotificationCampaignSlug.SUB_RETARGETING, isActive: true },
      relations: ['translations'],
    })

    if (!campaign) {
      this.logger.warn(`La campaña no existe o está inactiva.`)
      return
    }

    for (const tracker of pendingTrackers) {
      // 3. Control de Opt-Out: Verificar preferencia del usuario
      const preference = await this.userPreferenceRepository.findOne({
        where: { userId: tracker.userId, campaignSlug: tracker.campaignSlug },
      })

      if (preference && !preference.isEnabled) {
        // Si la desactivó, limpiamos el tracker residual y saltamos al siguiente
        await this.trackerRepository.delete({
          userId: tracker.userId,
          campaignSlug: tracker.campaignSlug,
        })
        continue
      }

      // 4. Buscamos al usuario para validar nivel de acceso, idioma y tokens
      const user = await this.usersRepository.findOne({
        where: { id: tracker.userId, accessLevel: AccessLevel.FREE },
      })
      if (!user) continue

      // 5. Manejo de idiomas y fallback
      const userLang = user.language || 'en'
      const translation =
        campaign.translations.find((t) => t.languageCode === userLang) ||
        campaign.translations.find((t) => t.languageCode === 'en')

      if (!translation) {
        this.logger.error(`Sin traducción para el idioma o fallback en inglés.`)
        continue
      }

      this.logger.log(`Enviando push retargeting a: ${user.username}`)

      // Despachamos la push via Firebase
      await this.sendPushNotification(
        user.fcmTokens,
        translation.title,
        translation.body,
        'kium://subscription',
      )

      // 6. En lugar de limpiar la bandera en User, marcamos el tracker como notificado
      await this.trackerRepository.update(
        { userId: tracker.userId, campaignSlug: tracker.campaignSlug },
        { lastNotifiedAt: new Date() },
      )
    }
  }

  async updateUserPreference(
    userId: string,
    slug: string,
    isEnabled: boolean,
  ): Promise<void> {
    await this.userPreferenceRepository.upsert(
      {
        userId: userId,
        campaignSlug: slug,
        isEnabled: isEnabled,
        updatedAt: new Date(),
      },
      ['userId', 'campaignSlug'], // 👈 Pasamos directo el array de las PKs que hacen conflicto
    )
  }

  async trackUserEvent(userId: string, slug: string): Promise<void> {
    await this.trackerRepository.upsert(
      {
        userId: userId,
        campaignSlug: slug,
        lastTriggeredAt: new Date(),
        lastNotifiedAt: null, // Ahora sí compila nativo sin quejas
      },
      ['userId', 'campaignSlug'],
    )
  }

  // =========================================================================
  // --- 🔴 AUTOMATIZACIÓN 2: MÉTRICAS SEMANALES (PRODUCT PERFORMANCE) ---
  // =========================================================================

  // 🧪 ESCENARIO A (Inmediatez - Comentado): Corre cada 3 minutos, Ventana de 2.5 min.
  // @Cron('*/3 * * * *')

  // 🚀 ESCENARIO C (Producción - Comentado): Corre todos los lunes a las 9:00 AM, Ventana de 6 días.
  // @Cron('0 9 * * 1')

  // 🔍 ESCENARIO B (Prueba Media - ACTIVO): Corre exactamente cada hora y media (90 minutos).
  @Cron('*/90 * * * *') // ⏳ Se ejecuta cada 90 minutos exactos
  async handleProductPerformanceCampaign() {
    this.logger.log(
      'Procesando campaña de rendimiento de productos (product_performance)...',
    )

    const CAMPAIGN_SLUG = 'product_performance'

    // --- VARIABLES DE TIEMPO SEGÚN ESCENARIO ---
    // Inmediatez: 150 * 1000 (2.5 Minutos)
    // Prueba Media: 90 * 60 * 1000 (1 Hora y media)
    // Producción: 6 * 24 * 60 * 60 * 1000 (6 Días)
    const ANTI_SPAM_WINDOW_MS = 90 * 60 * 1000

    // 1. Traemos la campaña activa con sus traducciones
    const campaign = await this.campaignRepository.findOne({
      where: { slug: CAMPAIGN_SLUG, isActive: true },
      relations: ['translations'],
    })

    if (!campaign) {
      this.logger.warn(
        `La campaña "${CAMPAIGN_SLUG}" no existe o está inactiva.`,
      )
      return
    }

    // 2. Traemos TODOS los usuarios pero filtramos que tengan AL MENOS un token FCM válido
    // (Un usuario deslogueado debería tener su array de tokens vacío o nulo)
    const users = await this.usersRepository.find()

    for (const user of users) {
      try {
        // 🔒 CONTROL DE SEGURIDAD EXTREMO: Si no hay tokens, el usuario está deslogueado. No procesar.
        if (!user.fcmTokens || user.fcmTokens.length === 0) {
          continue
        }

        // 3. Control de Opt-Out (Preferencia del usuario)
        const preference = await this.userPreferenceRepository.findOne({
          where: { userId: user.id, campaignSlug: CAMPAIGN_SLUG },
        })

        if (preference && !preference.isEnabled) {
          continue
        }

        // 🛡️ CONTROL ANTI-SPAM (RECURRENTE CADA 3 MINUTOS):
        // Buscamos cuándo fue el último impacto real de este reporte
        const tracker = await this.trackerRepository.findOne({
          where: {
            userId: user.id,
            campaignSlug: CAMPAIGN_SLUG,
          },
        })

        if (tracker && tracker.lastNotifiedAt) {
          // Calculamos cuántos milisegundos pasaron desde la última push enviada
          const msSinceLastNotification =
            Date.now() - tracker.lastNotifiedAt.getTime()

          // ⏳ VENTANA DE SEGURIDAD:
          if (msSinceLastNotification < ANTI_SPAM_WINDOW_MS) {
            this.logger.log(
              `Evitando envío duplicado para ${user.username}. Última push hace ${Math.round(msSinceLastNotification / 1000)}s. Saltando...`,
            )
            continue
          }
        }

        // 4. Tu query del Dashboard para validar si califica (si vendió algo)
        const summary = await this.dashboardService.getHomeSummary(
          user.id,
          user.accessLevel,
        )

        if (
          !summary.topSellingProducts ||
          summary.topSellingProducts.length === 0
        ) {
          continue
        }

        // 5. Manejo de idiomas y fallback
        const userLang = user.language || 'en'
        const translation =
          campaign.translations.find((t) => t.languageCode === userLang) ||
          campaign.translations.find((t) => t.languageCode === 'en')

        if (!translation) {
          this.logger.error(
            `Sin traducción para el idioma o fallback en inglés.`,
          )
          continue
        }

        this.logger.log(`Enviando push de performance a: ${user.username}`)

        // 6. Despachamos usando tu método nativo
        await this.sendPushNotification(
          user.fcmTokens,
          translation.title,
          translation.body,
          'kium://stock_filter?status=TOP_SALES',
        )

        // 7. 🔥 EL PASO FALTANTE: Crear o actualizar el tracker para clavarle el 'lastNotifiedAt'
        // Esto evita de forma matemática que le lleguen 2 seguidas o que vuelva a enviarse en el próximo tick del cron
        await this.trackerRepository.upsert(
          {
            userId: user.id,
            campaignSlug: CAMPAIGN_SLUG,
            lastTriggeredAt: new Date(),
            lastNotifiedAt: new Date(), // Marcamos como enviado AHORA
          },
          ['userId', 'campaignSlug'],
        )
      } catch (error) {
        this.logger.error(
          `Error procesando métricas semanales para usuario ${user.id}:`,
          error,
        )
      }
    }
  }
}
