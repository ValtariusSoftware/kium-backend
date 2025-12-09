import { Field, ObjectType } from '@nestjs/graphql'

/**
 * 💡 Tipo de objeto GraphQL para la respuesta de renovación de tokens.
 * Se define como CLASE para ser compatible con el decorador @Mutation(() => Clase).
 */
@ObjectType()
export class RefreshPayload {
  @Field(() => String, {
    description: 'Nuevo Token de acceso JWT de corta duración.',
  })
  accessToken: string

  @Field(() => String, {
    description: 'Nuevo Token de refresco JWT de larga duración.',
  })
  refreshToken: string
}
