// src/users/users.service.ts

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'

@Injectable()
export class UsersService {
  constructor(
    // Inyectamos el repositorio de la entidad User
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // Método para buscar todos los usuarios
  async findAll(): Promise<User[]> {
    return this.usersRepository.find()
  }
}
