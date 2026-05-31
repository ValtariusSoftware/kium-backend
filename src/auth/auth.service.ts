import {
  Injectable,
  InternalServerErrorException,
  Logger,
  Inject,
  UnauthorizedException,
} from '@nestjs/common'
import * as admin from 'firebase-admin'
import { JwtService, JwtSignOptions } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { UsersService, FirebaseDecodedToken } from '../users/users.service'
import { AuthPayload } from './entities/auth-payload.entity'
import { RefreshPayload } from './entities/refresh-payload.entity'

// Define la carga útil (payload) del token JWT
export interface JwtPayload {
  sub: string // ID del usuario (UID de Firebase)
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('FIREBASE_ADMIN') private firebaseApp: admin.app.App,
  ) {}

  /**
   * Genera Access Token y Refresh Token.
   */
  private generateTokens(userId: string): {
    accessToken: string
    refreshToken: string
  } {
    const payload: JwtPayload = { sub: userId }

    // 1. Generación del Access Token (usa la configuración por defecto del módulo: JWT_SECRET)
    const accessToken = this.jwtService.sign(payload)

    // 2. Generación del Refresh Token (usa opciones personalizadas)

    // 🚨 FIX CRÍTICO: Usar un SECRETO DIFERENTE para el Refresh Token.
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret')

    // 🚨 BYPASS DE ESLINT para el tipo de expiración.
    const refreshExpiration = this.configService.get<string>(
      'jwt.refreshExpiration',
    ) as any

    const refreshSignOptions: JwtSignOptions = {
      secret: refreshSecret, // 💡 CLAVE SECRETA DIFERENTE AQUÍ
      expiresIn: refreshExpiration,
    }

    const refreshToken = this.jwtService.sign(payload, refreshSignOptions)

    return { accessToken, refreshToken }
  }

  /**
   * Procesa el token de Google/Firebase para iniciar sesión y devuelve tokens.
   */
  async googleAuth(idToken: string): Promise<AuthPayload> {
    let decodedToken: admin.auth.DecodedIdToken

    try {
      decodedToken = await this.firebaseApp.auth().verifyIdToken(idToken)
      this.logger.log(
        `Token verificado exitosamente para: ${decodedToken.email}`,
      )
    } catch (error) {
      const err = error as { message?: string }
      this.logger.error(
        `Fallo en la verificación del token: ${err.message || 'Error desconocido'}`,
      )
      throw new UnauthorizedException(
        'Token de autenticación inválido o expirado.',
      )
    }

    if (!decodedToken.email || !decodedToken.name) {
      this.logger.error(
        'Token válido, pero faltan campos (email o nombre) necesarios para crear el usuario.',
      )
      throw new InternalServerErrorException(
        'Token incompleto: El email o nombre del usuario son requeridos para el registro.',
      )
    }

    // Asignación segura con aserción explícita 'as string'
    const tokenPayload: FirebaseDecodedToken = {
      user_id: decodedToken.uid,
      email: decodedToken.email as string,
      name: decodedToken.name as string,
    }

    // Realizar el FindOrCreate (Upsert)
    const user = await this.usersService.upsertUser(tokenPayload)

    // Generar tokens
    const { accessToken, refreshToken } = this.generateTokens(user.id)

    // Devolver la carga útil completa
    console.log(refreshToken)
    return {
      user,
      accessToken,
      refreshToken,
    }
  }

  /**
   * Renueva el Access Token usando el Refresh Token.
   */
  refreshAccessToken(token: string): Promise<RefreshPayload> {
    try {
      // 🚨 FIX CRÍTICO: Usar el SECRETO DE REFRESH para verificar el Refresh Token
      const refreshSecret = this.configService.get<string>('jwt.refreshSecret')

      // Verificar la validez del Refresh Token
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: refreshSecret, // 💡 CLAVE SECRETA DIFERENTE AQUÍ
      })

      // Generar un nuevo Access Token y Refresh Token
      const { accessToken, refreshToken } = this.generateTokens(payload.sub)

      return Promise.resolve({
        accessToken,
        refreshToken,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.logger.error(`Error al refrescar token: ${errorMessage}`)

      // Es vital que el error sea claro, ya que si falla, el usuario debe re-autenticarse.
      throw new UnauthorizedException(
        'Token de refresco inválido, expirado o con firma incorrecta. Vuelva a iniciar sesión.',
      )
    }
  }
}
