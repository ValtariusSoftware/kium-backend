import { ObjectType, Field } from '@nestjs/graphql'
import { User } from 'src/users/entities/user.entity'

/**
 * 💡 NUEVA ENTIDAD: Contenedor de la respuesta de autenticación.
 * El cliente móvil recibirá esta respuesta al hacer el login social.
 */
@ObjectType()
export class AuthPayload {
  @Field(() => User, { description: 'El usuario autenticado/creado' })
  user: User

  @Field(() => String, {
    description: 'Token JWT de corta duración (para cabecera Authorization)',
  })
  accessToken: string

  @Field(() => String, {
    description: 'Token de larga duración (para renovar el Access Token)',
  })
  refreshToken: string
}
