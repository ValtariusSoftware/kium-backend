// src/users/users.service.ts

import {
  Injectable,
  Logger,
  InternalServerErrorException, // 💡 IMPORTACIÓN REQUERIDA para lanzar la excepción
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccessLevel, SubscriptionStatus, User } from './entities/user.entity'

// 🚨 Definimos una interfaz para el payload del token decodificado de Firebase
// Usamos solo los campos necesarios
export interface FirebaseDecodedToken {
  user_id: string
  email: string
  name: string // Display name
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name) // 💡 Inicializamos el Logger

  constructor(
    // Inyectamos el repositorio de la entidad User
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // Método para buscar todos los usuarios
  async findAll(): Promise<User[]> {
    return this.usersRepository.find()
  }

  /**
   * 💡 NUEVO MÉTODO CLAVE: Busca un usuario por ID o lo crea si no existe.
   * @param tokenPayload El payload decodificado del token de Firebase.
   * @returns El usuario encontrado o recién creado.
   */
  async upsertUser(tokenPayload: FirebaseDecodedToken): Promise<User> {
    const { user_id, email, name } = tokenPayload

    // 1. Intentar encontrar el usuario por su ID de Firebase
    let user = await this.usersRepository.findOne({
      where: { id: user_id },
    })

    if (user) {
      // 2. Si el usuario existe, se registra el inicio de sesión
      this.logger.log(
        `Usuario existente logueado: ID=${user.id}, Email=${user.email}`,
      )
      // Opcionalmente, se podría actualizar el 'updatedAt' (TypeORM lo hace automáticamente)
      return user
    }

    // 3. Si el usuario NO existe, se crea uno nuevo
    this.logger.log(`Creando nuevo usuario: ID=${user_id}, Email=${email}`)

    user = this.usersRepository.create({
      id: user_id, // Usamos el UID de Firebase como Primary Key
      email: email,
      username: name, // Usamos el nombre como username por defecto
      // Valores por defecto (FREE, NON_SUBSCRIBED) se aplican automáticamente por la entidad.
      subscriptionStatus: SubscriptionStatus.NON_SUBSCRIBED,
      accessLevel: AccessLevel.FREE,
    })

    try {
      // Guardar el nuevo usuario en la DB
      return await this.usersRepository.save(user)
    } catch (error) {
      // 🚨 CORRECCIÓN ESLINT/TS: Aserción explícita del tipo 'Error'
      const err = error as Error

      this.logger.error(
        `Error al guardar el nuevo usuario ${email}: ${err.message}`, // Usamos err.message
        err.stack, // Usamos err.stack
      )

      // 🚨 CORRECCIÓN DEL ERROR DE RETORNO:
      // Debe haber un 'throw' en el catch para satisfacer la promesa 'Promise<User>'
      throw new InternalServerErrorException(
        'Fallo al crear el usuario en la base de datos.',
      )
    }
    // NOTA: No se necesita un 'return' fuera del try/catch porque tanto el if como el catch/throw
    // cubren todas las rutas de la función.
  }
}
