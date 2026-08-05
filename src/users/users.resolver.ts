import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql'
import { User } from './entities/user.entity'
import { UsersService } from './users.service'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { UpdateAccessLevelInput } from './dto/update-access-level.input'
@Resolver(() => User)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => User, { name: 'me', nullable: true })
  async me(
    @CurrentUser() user: User, // 👈 Usamos tu decorador en lugar de @Context
  ): Promise<User | null> {
    // Si el decorador ya te devuelve la entidad completa desde la DB,
    // podrías retornar 'user' directamente.
    // Pero para asegurar que traemos el accessLevel más fresco de la DB,
    // buscamos por ID.
    if (!user) return null
    return this.usersService.findOneById(user.id)
  }

  @Query(() => [User], { name: 'users' })
  async getUsers(): Promise<User[]> {
    return this.usersService.findAll()
  }

  @Mutation(() => User, { name: 'updateUserAccessLevel' })
  async updateAccessLevel(
    @Args('input') input: UpdateAccessLevelInput,
    @CurrentUser() user: User, // Obtenemos el ID del token para seguridad
  ): Promise<User> {
    // Solo el propio usuario (o un admin) puede cambiarse el nivel
    return this.usersService.changeAccessLevel(user.id, input.level)
  }

  // @Mutation(() => Boolean)
  // async updateFcmToken(
  //   @Args('token') token: string,
  //   @CurrentUser() user: User,
  // ): Promise<boolean> {
  //   return this.usersService.updateFcmToken(user.id, token)
  // }

  @Mutation(() => Boolean)
  async updateFcmToken(
    @Args('token') token: string,
    @Args('language') language: string, // 💎 Nuevo argumento que viene de Android
    @CurrentUser() user: User,
  ): Promise<boolean> {
    // Le pasamos el idioma al servicio
    return this.usersService.updateFcmToken(user.id, token, language)
  }

  @Mutation(() => Boolean)
  async logoutAndClearToken(
    @Args('token') token: string,
    @CurrentUser() user: User, // Tu decorador para obtener el usuario autenticado
  ): Promise<boolean> {
    return this.usersService.removeFcmToken(user.id, token)
  }

  @Mutation(() => Boolean, { name: 'deleteUserAccount' })
  async deleteUserAccount(@CurrentUser() user: User): Promise<boolean> {
    // El control de si el token es válido o no lo maneja directamente el servicio
    return this.usersService.deleteAccount(user)
  }

  @Mutation(() => Boolean, { name: 'resetMyTestData' })
  async resetMyTestData(
    @CurrentUser() user: User,
    @Context() context: any, // 👈 1. Inyectamos el contexto de GraphQL
  ): Promise<boolean> {
    // 2. Extraemos el header independientemente de si viene en minúscula o mayúscula
    const req = context.req || context.connection?.context
    const devKey =
      req?.headers['x-dev-reset-key'] || req?.headers['X-Dev-Reset-Key']

    return this.usersService.resetUserData(user, devKey)
  }
}
