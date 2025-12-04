// src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common'

/**
 * Clave de metadato que indica si una ruta es pública y debe omitir el guard de autenticación.
 */
export const IS_PUBLIC_KEY = 'isPublic'

/**
 * Decorador personalizado para marcar una ruta (o un método GraphQL) como pública.
 *
 * Cuando se utiliza un guard global (como FirebaseGuard), este decorador
 * permite que el guard sepa que debe saltarse la verificación de autenticación.
 * * Se utiliza en la mutación `googleAuth`.
 * * Uso: @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
