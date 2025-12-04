// src/auth/auth.service.ts

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  Inject, // 💡 Necesario para inyectar 'FIREBASE_ADMIN'
} from '@nestjs/common'
import * as admin from 'firebase-admin' // Usamos 'admin' para tipado de DecodedIdToken
import {
  UsersService,
  FirebaseDecodedToken, // 💡 Importamos la interfaz del service
} from '../users/users.service'
import { User } from '../users/entities/user.entity'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly usersService: UsersService,
    // 💡 INYECCIÓN: Utilizamos el token que definiste en FirebaseModule
    @Inject('FIREBASE_ADMIN') private firebaseApp: admin.app.App,
  ) {}

  /**
   * 💡 CLAVE: Procesa el token de Google/Firebase para iniciar sesión.
   * Verifica el token, decodifica el usuario y realiza el Upsert.
   */
  async googleAuth(idToken: string): Promise<User> {
    // Definimos el tipo exacto
    let decodedToken: admin.auth.DecodedIdToken

    try {
      // 1. Verificar el token usando Firebase Admin SDK inyectado
      decodedToken = await this.firebaseApp.auth().verifyIdToken(idToken)
      this.logger.log(
        `Token verificado exitosamente para: ${decodedToken.email}`,
      )
    } catch (error) {
      // 🚨 CORRECCIÓN DEL ERROR DE TIPADO: Tipamos el error para acceder a 'message'
      const err = error as { message?: string }

      this.logger.error(
        `Fallo en la verificación del token: ${err.message || 'Error desconocido'}`,
      )

      throw new InternalServerErrorException(
        'Token de autenticación inválido o expirado.',
      )
    }

    // 🚨 COMPROBACIÓN CRÍTICA PARA EL UPSET
    // Chequeamos que los campos obligatorios para el registro existan.
    if (!decodedToken.email || !decodedToken.name) {
      this.logger.error(
        'Token válido, pero faltan campos (email o nombre) necesarios para crear el usuario.',
      )
      throw new InternalServerErrorException(
        'Token incompleto: El email o nombre del usuario son requeridos para el registro.',
      )
    }

    // 2. Extraer el payload necesario.
    // 🚨 SOLUCIÓN FINAL Y DEFINITIVA:
    // Creamos las variables tipadas de manera explícita y luego las asignamos,
    // confiando en la validación IF previa. El operador '!' debería ser suficiente.
    // Si la compilación sigue fallando, es una limitación de la versión/configuración de TS.

    // Asignación segura ya que el IF anterior garantiza que son strings.

    const tokenPayload: FirebaseDecodedToken = {
      user_id: decodedToken.uid,
      email: decodedToken.email, // ✅ Asignación desde variable ya tipada
      name: decodedToken.name! as string, // ✅ Asignación desde variable ya tipada
    }

    // 3. Realizar el FindOrCreate (Upsert) en la base de datos
    return this.usersService.upsertUser(tokenPayload)
  }
}
