import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { Reflector } from '@nestjs/core'
import { AuthGuard, IAuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator'
import { Request } from 'express'
import { User } from 'src/users/entities/user.entity'

// Interfaz para tipar el objeto de Request de Express con el usuario de TypeORM
interface AuthenticatedRequest extends Request {
  user?: User
}

// Interfaz para tipar el contexto de GraphQL
interface GqlContext {
  req: AuthenticatedRequest
  res: unknown // Tipo seguro
}

/**
 * GUARD JWT: Utiliza la estrategia 'jwt' definida por Passport.
 */
@Injectable()
// '@ts-expect-error' ignora el error 'Unsafe call' en la extensión de la clase, causado por la factoría AuthGuard('jwt')
export class JwtGuard extends (AuthGuard('jwt') as unknown as {
  new (): IAuthGuard
}) {
  private readonly logger = new Logger(JwtGuard.name)

  constructor(private reflector: Reflector) {
    super()
  }

  // 1. Adaptar el contexto de GraphQL a HTTP estándar para Passport
  getRequest(context: ExecutionContext): AuthenticatedRequest {
    const ctx = GqlExecutionContext.create(context)
    const gqlContext: GqlContext = ctx.getContext()
    return gqlContext.req
  }

  // 2. Comprobar si la ruta es pública antes de intentar autenticar
  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    // El error 'Unsafe call' en super.canActivate() se debe a la herencia tipada de Passport.
    return super.canActivate(context) as Promise<boolean> | boolean
  }

  /**
   * 3. Manejar errores de autenticación
   * Tipamos los argumentos y el retorno de forma segura.
   */
  handleRequest<TUser = User>(
    err: unknown,
    user: TUser | undefined,
    info: Error | undefined,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    // LINEA DE INICIO (AÑADIDA): Si hay un error (err) O no hay usuario (!user), ejecutamos el bloque de error.
    if (err || !user) {
      let errorMessage = 'Token inválido' // Acceso seguro a .message

      if (info && info instanceof Error) {
        errorMessage = info.message
      } else if (!user) {
        errorMessage = 'Usuario no encontrado o token expirado/faltante.'
      } // Convertir el status a string solo si está presente, sino usar 'N/A'

      const statusString =
        typeof status === 'number' || typeof status === 'string'
          ? String(status)
          : 'N/A' // 🛑 LOGGING: Solo se ejecuta aquí, dentro de la condición de error.

      this.logger.error(
        `Error de autenticación JWT: ${errorMessage} - Status HTTP: ${statusString}`,
      )

      if (err) {
        // 1. Si es un objeto Error, lo lanzamos directamente.
        if (err instanceof Error) {
          throw err
        } // 2. Si no es un Error, verificamos el tipo antes de convertir a string.

        const errorDetails =
          typeof err === 'string'
            ? err
            : 'Unknown non-Error object received. Check Passport configuration.'

        throw new UnauthorizedException(
          `Authentication failed during Passport execution: ${errorDetails}`,
        )
      }

      if (!user) {
        throw new UnauthorizedException(
          'Token de autenticación inválido o expirado.',
        )
      }
    } // LINEA FINAL (AÑADIDA): Cierre del bloque 'if (err || !user)'.
    // Si el código llega aquí (fuera del IF), la autenticación fue exitosa.
    return user as TUser
  }
}
