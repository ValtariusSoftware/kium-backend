import { ExtractJwt, Strategy } from 'passport-jwt'
import { PassportStrategy } from '@nestjs/passport'
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UsersService } from '../../users/users.service'
import { User } from '../../users/entities/user.entity'

/**
 * 🚨 Interfaz PLACEHOLDER para el Payload decodificado del JWT.
 * Ajustar si está definida en otro archivo (e.g., import { JwtPayload } from '../auth.types').
 */
export interface JwtPayload {
  sub: string // El ID del usuario (subject)
  iat: number // Tiempo de emisión
  exp: number // Tiempo de expiración
}

/**
 * ESTRATEGIA: Define cómo se extrae y se valida el Access Token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    // Configuramos la estrategia
    const jwtSecret = configService.get<string>('jwt.secret') as string
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Extrae el token del encabezado 'Authorization: Bearer <token>'
      ignoreExpiration: false, // La estrategia fallará si el token ha expirado
      secretOrKey: jwtSecret, // Usa el secreto configurado en tu app.config.ts
    })
    this.logger.log('JwtStrategy inicializada.')
  } /**
   * VALIDACIÓN: Se llama automáticamente después de verificar la firma y expiración del token.
   * @param payload El payload decodificado del JWT.
   * @returns El objeto User si es encontrado.
   * @throws UnauthorizedException si el usuario no es encontrado.
   */

  async validate(payload: JwtPayload): Promise<User> {
    this.logger.debug(
      `[JwtStrategy] Token verificado. Buscando usuario con ID: ${payload.sub}`,
    ) // 1. Intentamos buscar el usuario en la base de datos
    // El servicio ahora retorna 'User | null'

    const user = await this.usersService.findOneById(payload.sub) // 2. Si el usuario no existe, lanzamos un error de no autorizado

    if (!user) {
      this.logger.error(
        `❌ [JwtStrategy] Usuario con ID ${payload.sub} NO encontrado en la DB. Lanzando UnauthorizedException.`,
      )
      throw new UnauthorizedException(
        'Credenciales inválidas o usuario no encontrado en la base de datos.',
      )
    }

    this.logger.debug(
      `🎉 [JwtStrategy] Usuario ${user.id} autenticado correctamente.`,
    ) // 3. Si todo está bien, retornamos el objeto user.
    // Este objeto se adjuntará a `req.user`

    return user
  }
}
