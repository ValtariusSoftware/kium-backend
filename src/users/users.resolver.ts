import { Resolver, Query } from '@nestjs/graphql'
import { User } from './entities/user.entity'
import { UsersService } from './users.service'
@Resolver(() => User)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => [User], { name: 'users' })
  async getUsers(): Promise<User[]> {
    return this.usersService.findAll()
  }
}
