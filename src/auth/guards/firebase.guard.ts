// src/auth/guards/firebase.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import * as admin from 'firebase-admin'
import { Request } from 'express'

interface GqlContext {
  req: AuthenticatedRequest
  res: Response
}
interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken // El token decodificado de Firebase
}

@Injectable()
export class FirebaseGuard implements CanActivate {
  constructor(@Inject('FIREBASE_ADMIN') private firebaseApp: admin.app.App) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context)

    // 💡 Tipamos el contexto con GqlContextType y extraemos el Request tipado
    const gqlContext: GqlContext = ctx.getContext()

    const request: AuthenticatedRequest = gqlContext.req

    // 3. 💡 Tipado explícito de la cabecera (esto también ayuda al linter)
    const authorizationHeader: string | undefined =
      request.headers.authorization

    // 4. Corrección de la lógica con tipado estricto
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      // 🛑 Error: "Unsafe assignment of an `any` value." (Resuelto por tipado)
      throw new UnauthorizedException('No se proporcionó token Bearer.')
    }

    const idToken = authorizationHeader.substring(7)

    try {
      // 5. El argumento es seguro porque idToken es un string
      const decodedToken: admin.auth.DecodedIdToken = await this.firebaseApp
        .auth()
        .verifyIdToken(idToken)

      // 6. Asignación segura gracias a la interfaz AuthenticatedRequest
      request.user = decodedToken
      console.log('USUARIO:', request.user)
      return true
    } catch (error) {
      // 7. Corrección del console.error para Unsafe assignment (tipamos error)
      const err = error as { message?: string }
      console.error(
        'Error al verificar token de Firebase:',
        err.message || 'Error desconocido.',
      )

      throw new UnauthorizedException(
        'Token de autenticación inválido o expirado.',
      )
    }
  }
}
