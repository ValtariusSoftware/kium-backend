import { Module } from '@nestjs/common'
import * as admin from 'firebase-admin'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_ADMIN', // 💡 Token de inyección: 'FIREBASE_ADMIN'
      useFactory: (configService: ConfigService) => {
        // 1. Cargamos las variables de entorno de forma segura
        const privateKey = configService.get<string>('firebase.privateKey')
        const clientEmail = configService.get<string>('firebase.clientEmail')
        const projectId = configService.get<string>('firebase.projectId')

        // 2. Comprobación básica de seguridad (opcional, pero buena práctica)
        if (!privateKey || !clientEmail || !projectId) {
          throw new Error(
            'Firebase Admin credentials not found in environment variables.',
          )
        }

        const firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            // Creamos el objeto de credenciales a partir de las variables de entorno
            projectId: projectId,
            clientEmail: clientEmail,
            // El .replace(/\\n/g, '\n') asegura que los saltos de línea se interpreten correctamente
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        })

        return firebaseApp
      },
      inject: [ConfigService],
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
