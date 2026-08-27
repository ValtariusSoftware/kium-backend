// src/users/users.service.ts

import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  Inject,
  forwardRef,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccessLevel, SubscriptionStatus, User } from './entities/user.entity'
import { UserErrorCode } from './enums/user-error-code.enum'
import * as admin from 'firebase-admin'
import { Item } from 'src/items/entities/item.entity'
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service'
import { SyncEventEntity } from 'src/sync/entities/sync-event.entity'
import { Sale } from 'src/sales/entities/sale.entity'
// 🚨 Definimos una interfaz para el payload del token decodificado de Firebase
// Usamos solo los campos necesarios
interface FormattedCurrency {
  code: string
  name: string
  symbol: string
}
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
    @InjectRepository(Item)
    private itemsRepository: Repository<Item>,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @InjectRepository(SyncEventEntity)
    private syncEventsRepository: Repository<SyncEventEntity>,
    @Inject('FIREBASE_ADMIN') private readonly firebaseApp: admin.app.App,
    @InjectRepository(Sale)
    private readonly salesRepository: Repository<Sale>,
  ) {}

  // Método para buscar todos los usuarios
  async findAll(): Promise<User[]> {
    return this.usersRepository.find()
  }

  async findOneById(id: string): Promise<User | null> {
    // Se usa findOne por si hay filtros ocultos (como soft-delete)
    return this.usersRepository.findOne({ where: { id } })
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

  async changeAccessLevel(userId: string, level: AccessLevel): Promise<User> {
    const user = await this.findOneById(userId)
    if (!user) throw new InternalServerErrorException('Usuario no encontrado')

    user.accessLevel = level

    if (level === AccessLevel.PRO) {
      user.subscriptionStatus = SubscriptionStatus.ACTIVE
      if (!user.subscriptionStartDate) {
        user.subscriptionStartDate = new Date()
      }

      // 🔓 Si pasa a PRO, destrabamos todos sus ítems de golpe
      await this.itemsRepository.update({ userId }, { isLockedByPlan: false })
    } else {
      user.subscriptionStatus = SubscriptionStatus.NON_SUBSCRIBED
      user.subscriptionStartDate = undefined

      // 🔍 1. Buscamos dinámicamente el límite permitido para FREE (ej: 100) desde la tabla subscription_features
      const freeLimit = await this.subscriptionsService.getLimit(
        'stock_limit',
        AccessLevel.FREE,
      )
      // const freeLimit = 4
      // 📦 2. Traemos todos los ítems activos del usuario ordenados por fecha de creación (los más viejos primero)
      const items = await this.itemsRepository.find({
        where: { userId },
        order: { createdAt: 'ASC' },
      })

      // 🔒 3. Si supera el límite gratuito, bloqueamos los excedentes (los más nuevos)
      if (items.length > freeLimit) {
        const itemsToLock = items.slice(freeLimit)
        const lockIds = itemsToLock.map((item) => item.id)

        await this.itemsRepository
          .createQueryBuilder()
          .update()
          .set({ isLockedByPlan: true })
          .where('id IN (:...ids)', { ids: lockIds })
          .execute()
      } else {
        // Si está por debajo del límite, aseguramos que ninguno quede bloqueado por error
        await this.itemsRepository.update({ userId }, { isLockedByPlan: false })
      }
    }

    return this.usersRepository.save(user)
  }

  // async updateFcmToken(userId: string, token: string): Promise<boolean> {
  //   const user = await this.usersRepository.findOneBy({ id: userId })
  //   if (!user) return false

  //   // Evitamos duplicados en el array
  //   const tokens = user.fcmTokens || []
  //   if (!tokens.includes(token)) {
  //     tokens.push(token)
  //     await this.usersRepository.update(userId, { fcmTokens: tokens })
  //   }
  //   return true
  // }

  async updateFcmToken(
    userId: string,
    token: string,
    language: string,
  ): Promise<boolean> {
    const user = await this.usersRepository.findOneBy({ id: userId })
    if (!user) return false

    // 1. Evitamos duplicados en el array de tokens
    const tokens = user.fcmTokens || []
    let hasChanges = false

    if (!tokens.includes(token)) {
      tokens.push(token)
      hasChanges = true
    }

    // 2. 💎 Si el idioma guardado en la DB es distinto al que tiene la app ahora, lo actualizamos
    if (user.language !== language) {
      user.language = language
      hasChanges = true
    }

    // Guardamos en la base de datos sólo si hubo cambios en los tokens o en el idioma
    if (hasChanges) {
      await this.usersRepository.update(userId, {
        fcmTokens: tokens,
        language: user.language,
      })
    }

    return true
  }

  async removeFcmToken(
    userId: string,
    tokenToRemove: string,
  ): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { id: userId } })
    if (!user || !user.fcmTokens) return false

    // Filtramos el token para removerlo del array
    user.fcmTokens = user.fcmTokens.filter((token) => token !== tokenToRemove)

    await this.usersRepository.save(user)
    return true
  }

  async deleteAccount(user: User | null): Promise<boolean> {
    // 1. Validaciones previas (se mantienen igual)
    if (!user || !user.id) {
      throw new UnauthorizedException(UserErrorCode.USER_NOT_AUTHENTICATED)
    }

    const userExists = await this.usersRepository.findOne({
      where: { id: user.id },
    })
    if (!userExists) {
      throw new NotFoundException(UserErrorCode.USER_NOT_FOUND)
    }

    try {
      this.logger.log(`Iniciando borrado para: ID=${user.id}`)

      // --- AQUÍ ESTÁ EL CAMBIO ---
      try {
        await this.firebaseApp.auth().deleteUser(user.id)
        this.logger.log(`Firebase Auth eliminado: ${user.id}`)
      } catch (fbError: any) {
        // Si el usuario no existe en Firebase, lo logueamos pero seguimos adelante
        if (fbError.code === 'auth/user-not-found') {
          this.logger.warn(
            `Usuario ${user.id} no encontrado en Firebase. Continuando a Postgres.`,
          )
        } else {
          // Si es otro error de Firebase, lo propagamos
          throw fbError
        }
      }
      // ----------------------------

      // 2. Destrucción del registro en Postgres
      // Como ya configuramos ON DELETE CASCADE, esto borrará todo automáticamente
      await this.usersRepository.delete(user.id)
      this.logger.log(`Postgres eliminado: ${user.id}`)

      return true
    } catch (error) {
      this.logger.error(
        `Error crítico al borrar cuenta ${user.id}: ${(error as Error).message}`,
      )
      throw new InternalServerErrorException(
        UserErrorCode.DELETE_ACCOUNT_FAILED,
      )
    }
  }

  async resetUserData(user: User | null, devKey: string): Promise<boolean> {
    // 1. Doble validación de seguridad estricta para entornos de producción
    if (
      process.env.NODE_ENV === 'production' &&
      !process.env.DEV_RESET_SECRET_KEY
    ) {
      throw new ForbiddenException('Esta acción está prohibida en producción.')
    }

    const expectedKey =
      process.env.DEV_RESET_SECRET_KEY || 'valtarius_dev_secret_2026'
    console.log('Clave recibida:', devKey, 'Clave esperada:', expectedKey)
    if (devKey !== expectedKey) {
      throw new UnauthorizedException('Clave secreta de reseteo inválida.')
    }

    // 2. Validaciones previas de usuario
    if (!user || !user.id) {
      throw new UnauthorizedException(UserErrorCode.USER_NOT_AUTHENTICATED)
    }

    const userExists = await this.usersRepository.findOne({
      where: { id: user.id },
    })
    if (!userExists) {
      throw new NotFoundException(UserErrorCode.USER_NOT_FOUND)
    }

    try {
      this.logger.warn(
        `🧹 [DEV RESET] Limpiando datos de prueba para el usuario: ID=${user.id}`,
      )

      // 3. Borrado de datos asociados (Ajustá según tus repositorios inyectados)
      // Si usas ON DELETE CASCADE en la FK del usuario hacia Item/Sales,
      // borrar y recrear el usuario o vaciar sus relaciones es directo.
      // Aquí limpiamos los ítems de este usuario específico:
      await this.itemsRepository.delete({ user: { id: user.id } })
      await this.syncEventsRepository.delete({ user: { id: user.id } })
      await this.salesRepository.delete({ user: { id: user.id } })
      // Si tenés más repositorios (Ventas, Recetas, etc.), limpialos acá en orden:
      // await this.salesRepository.delete({ user: { id: user.id } })
      // await this.recipesRepository.delete({ user: { id: user.id } })

      this.logger.log(
        `✅ [DEV RESET] Datos de prueba eliminados exitosamente para: ${user.id}`,
      )
      return true
    } catch (error) {
      this.logger.error(
        `❌ Error al resetear datos de usuario ${user.id}: ${(error as Error).message}`,
      )
      throw new InternalServerErrorException(
        UserErrorCode.DELETE_ACCOUNT_FAILED, // O un código de error específico para esto
      )
    }
  }

  async getAvailableCurrencies(
    user: User | null,
    lang?: string | null,
  ): Promise<FormattedCurrency[]> {
    if (!user) {
      throw new UnauthorizedException('No autorizado')
    }

    const rawLang =
      lang || (typeof user.language === 'string' ? user.language : 'en')
    const targetLang = rawLang.includes('_')
      ? rawLang.replace('_', '-')
      : rawLang

    // Obtenemos todos los códigos ISO de monedas oficiales directamente de Node.js
    const allCodes = Intl.supportedValuesOf('currency')
    const formattedCurrencies: FormattedCurrency[] = []

    const currencyDisplayNames = new Intl.DisplayNames([targetLang, 'en'], {
      type: 'currency',
    })

    for (const code of allCodes) {
      // 1. Obtener nombre traducido
      let name = code
      try {
        const translated = currencyDisplayNames.of(code)
        if (translated) {
          name = translated.charAt(0).toUpperCase() + translated.slice(1)
        }
      } catch (error) {
        this.logger.error(
          `Error al obtener el nombre de la moneda ${code}:`,
          error,
        )
        continue // Si Intl no reconoce el código, lo saltamos
      }

      // 2. Obtener símbolo
      let symbol = code
      try {
        const parts = new Intl.NumberFormat(targetLang, {
          style: 'currency',
          currency: code,
        }).formatToParts(0)
        const symbolPart = parts.find((p) => p.type === 'currency')
        if (symbolPart) {
          symbol = symbolPart.value
        }
      } catch (error) {
        this.logger.error(
          `Error al obtener el símbolo de la moneda ${code}:`,
          error,
        )
        symbol = code
      }

      formattedCurrencies.push({
        code,
        name,
        symbol,
      })
    }

    return formattedCurrencies.sort((a, b) =>
      a.name.localeCompare(b.name, targetLang, { sensitivity: 'base' }),
    )
  }

  async searchCurrencies(
    user: User | null,
    search: string,
    lang?: string | null,
  ): Promise<FormattedCurrency[]> {
    if (!user) {
      throw new UnauthorizedException('No autorizado')
    }

    const rawLang =
      lang || (typeof user.language === 'string' ? user.language : 'en')
    const targetLang = rawLang.includes('_')
      ? rawLang.replace('_', '-')
      : rawLang

    // Usamos el listado nativo de Node.js en vez de currency-codes
    const allCodes = Intl.supportedValuesOf('currency')

    // Función auxiliar para limpiar tildes, acentos y pasar a minúsculas
    const normalizeText = (text: string) => {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
    }

    const searchNormalized = normalizeText(search)
    const filteredCurrencies: FormattedCurrency[] = []

    const currencyDisplayNames = new Intl.DisplayNames([targetLang, 'en'], {
      type: 'currency',
    })

    for (const code of allCodes) {
      // Obtener nombre traducido
      let name = code
      try {
        const translated = currencyDisplayNames.of(code)
        if (translated) {
          name = translated.charAt(0).toUpperCase() + translated.slice(1)
        } else {
          continue
        }
      } catch {
        continue // Si Intl no lo reconoce, lo saltamos
      }

      // Normalizamos tanto el código como el nombre para comparar sin tildes ni mayúsculas
      const matchesCode = normalizeText(code).includes(searchNormalized)
      const matchesName = normalizeText(name).includes(searchNormalized)

      if (!matchesCode && !matchesName) {
        continue
      }

      // Obtener símbolo
      let symbol = code
      try {
        const parts = new Intl.NumberFormat(targetLang, {
          style: 'currency',
          currency: code,
        }).formatToParts(0)
        const symbolPart = parts.find((p) => p.type === 'currency')
        if (symbolPart) {
          symbol = symbolPart.value
        }
      } catch {
        symbol = code
      }

      filteredCurrencies.push({
        code,
        name,
        symbol,
      })
    }

    return filteredCurrencies.sort((a, b) =>
      a.name.localeCompare(b.name, targetLang, { sensitivity: 'base' }),
    )
  }

  async completeOnboardingAndPreferences(
    user: User | null,
    currency: string,
    numberFormat: string,
  ): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('No autorizado')
    }

    // 1. Validar moneda
    const supportedCurrencies = Intl.supportedValuesOf('currency')
    const upperCurrency = currency.toUpperCase()

    if (!supportedCurrencies.includes(upperCurrency)) {
      throw new BadRequestException(`La moneda '${currency}' no es válida.`)
    }

    // 2. Validar formato numérico
    const validNumberFormats = ['dot-decimal', 'comma-decimal']
    if (!validNumberFormats.includes(numberFormat)) {
      throw new BadRequestException(
        `El formato numérico '${numberFormat}' no es válido.`,
      )
    }

    // 3. Asignar nuevos valores y completar onboarding (en la DB guardamos el string)
    user.currency = upperCurrency
    user.numberFormat = numberFormat
    user.onboardingCompleted = true

    // 4. Guardar en base de datos
    const savedUser = await this.usersRepository.save(user)

    // 💡 5. CONVERSIÓN PARA GRAPHQL: Igual que en el login, armamos el objeto currency
    const currencyResults = await this.searchCurrencies(
      savedUser,
      upperCurrency,
      savedUser.language,
    )

    const currencyObject =
      currencyResults.length > 0
        ? currencyResults[0]
        : { code: upperCurrency, name: upperCurrency, symbol: upperCurrency }

    // Retornamos el usuario con la moneda transformada en objeto para que GraphQL no falle
    return {
      ...savedUser,
      currency: currencyObject as any,
    }
  }
}
