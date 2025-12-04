// src/auth/auth.resolver.ts

import { Resolver, Mutation, Args } from '@nestjs/graphql'
import { User } from '../users/entities/user.entity'
import { AuthService } from './auth.service'
import { Public } from 'src/common/decorators/public.decorator'

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  /**
   * 💡 Mutación para el inicio de sesión social con Firebase ID Token.
   * @param idToken El token JWT generado por Firebase en el cliente.
   * @returns El objeto User autenticado/creado.
   */
  @Mutation(() => User, { name: 'googleAuth' })
  @Public() // 💡 Esta mutación NO debe requerir un token de autorización previo
  async googleAuth(@Args('idToken') idToken: string): Promise<User> {
    // La lógica de verificación, creación y retorno del usuario está en el servicio.
    return this.authService.googleAuth(idToken)
  }
}
