import { Injectable, Inject } from '@nestjs/common'
import * as admin from 'firebase-admin'

@Injectable()
export class NotificationsService {
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseApp: admin.app.App,
  ) {}

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
}
