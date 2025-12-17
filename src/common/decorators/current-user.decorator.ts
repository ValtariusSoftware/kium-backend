import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { User } from '../../users/entities/user.entity' // Asegúrate de que la ruta sea correcta

/**
 * Decorador personalizado para obtener el objeto 'user' del contexto de la solicitud.
 *
 * NOTA: El objeto 'user' se adjunta a 'req.user' por la estrategia de Passport (JwtStrategy)
 * y el guard de Nest (JwtGuard).
 *
 * @returns El objeto User tipado, incluyendo el accessLevel.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): User => {
    // 1. Crear el contexto de GraphQL
    const ctx = GqlExecutionContext.create(context)

    // 2. Acceder al objeto 'request' (req) del contexto de GraphQL
    const request = ctx.getContext().req

    // 3. Devolver el objeto 'user' adjuntado por el JwtGuard en req.user
    // El 'user' estará tipado como la entidad User de TypeORM, que ya contiene 'accessLevel'.
    return request.user
  },
)
