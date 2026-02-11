import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
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
}
