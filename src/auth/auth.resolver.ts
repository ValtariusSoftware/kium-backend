import { Resolver, Mutation, Args } from '@nestjs/graphql'
import { AuthService } from './auth.service'
import { AuthPayload } from './entities/auth-payload.entity'
import { Public } from 'src/common/decorators/public.decorator'
import { RefreshPayload } from './entities/refresh-payload.entity'
// 🚨 FIX 3: Importamos la CLASE ObjectType

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Mutation(() => AuthPayload, {
    description: 'Autenticación con el ID Token de Google/Firebase.',
  })
  async googleAuth(
    @Args('idToken', { type: () => String }) idToken: string,
  ): Promise<AuthPayload> {
    return this.authService.googleAuth(idToken)
  }

  // 🚨 FIX 3: Usamos la CLASE RefreshPayload en el decorador para el retorno.
  // 🚨 FIX 4: El retorno ya no es inseguro (`no-unsafe-return`) porque el tipo está garantizado.
  @Public()
  @Mutation(() => RefreshPayload, {
    description: 'Usa el Refresh Token para obtener un nuevo Access Token.',
  })
  async refreshAccessToken(
    @Args('refreshToken', { type: () => String }) refreshToken: string,
  ): Promise<RefreshPayload> {
    return this.authService.refreshAccessToken(refreshToken)
  }
}
