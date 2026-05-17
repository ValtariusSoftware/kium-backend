import { BadRequestException, Injectable, Inject, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, LessThan } from 'typeorm'
import { Cron, CronExpression } from '@nestjs/schedule'
import * as admin from 'firebase-admin'

import { NotificationCampaign } from './entities/notification-campaign.entity'
import { NotificationCampaignTranslation } from './entities/notification-campaign-translation.entity'
import { User, AccessLevel } from 'src/users/entities/user.entity'
import { CreateNotificationCampaignInput } from './dto/create-notification-campaign.input'
import { UpdateNotificationCampaignInput } from './dto/update-notification-campaign.input'

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseApp: admin.app.App,
    @InjectRepository(NotificationCampaign)
    private readonly campaignRepository: Repository<NotificationCampaign>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // --- 🔴 ENVÍO FIREBASE ---
  async sendPushNotification(tokens: string[], title: string, body: string) {
    if (!tokens || tokens.length === 0) return

    const message: admin.messaging.MulticastMessage = {
      // 💎 CLAVE 1: Eliminamos el objeto "notification" raíz.
      // Usamos "data" para que el método onMessageReceived de Android tome el 100% del control.
      data: {
        title: title,
        body: body,
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
    const deleteResult = await this.campaignRepository.delete({ id: In(ids) })
    return (deleteResult.affected ?? 0) > 0
  }

  // --- 🔴 AUTOMATIZACIÓN (CRON RETARGETING DINÁMICO) ---
  @Cron(CronExpression.EVERY_MINUTE)
  async handleSubscriptionRetargeting() {
    this.logger.log('Ejecutando retargeting dinámico multi-idioma...')

    const testTimeGap = new Date(Date.now() - 1 * 60 * 1000) // 1 minuto para pruebas

    // 1. Buscar usuarios candidatos
    const candidates = await this.usersRepository.find({
      where: {
        accessLevel: AccessLevel.FREE,
        lastSubscriptionView: LessThan(testTimeGap),
      },
    })

    if (candidates.length === 0) return

    // 2. Traer la campaña con sus textos traducidos desde la DB
    const campaign = await this.campaignRepository.findOne({
      where: { slug: 'sub_retargeting', isActive: true },
      relations: ['translations'],
    })

    if (!campaign) {
      this.logger.warn(
        'La campaña "sub_retargeting" no existe o no está activa en la base de datos.',
      )
      return
    }

    this.logger.log(
      `Procesando retargeting para ${candidates.length} usuarios.`,
    )

    for (const user of candidates) {
      const userLang = user.language || 'en'

      // Buscamos traducción emparejada o aplicamos fallback a inglés
      let translation = campaign.translations.find(
        (t) => t.languageCode === userLang,
      )
      if (!translation) {
        translation = campaign.translations.find((t) => t.languageCode === 'en')
      }

      if (!translation) {
        this.logger.error(
          `No hay traducción ni en [${userLang}] ni en [en] para "sub_retargeting"`,
        )
        continue
      }

      this.logger.log(
        `Enviando push en idioma [${userLang}] a: ${user.username}`,
      )

      // Lanzamos la notificación con el texto dinámico recuperado de la DB
      await this.sendPushNotification(
        user.fcmTokens,
        translation.title,
        translation.body,
      )

      // Limpiamos bandera para evitar spam
      await this.usersRepository.update(user.id, {
        lastSubscriptionView: () => 'NULL',
      })
    }
  }
}
