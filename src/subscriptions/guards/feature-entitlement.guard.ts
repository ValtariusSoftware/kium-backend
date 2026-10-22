// src/subscriptions/guards/feature-entitlement.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'
import { EntitlementsService } from '../entitlements.service'
import { FEATURE_KEY } from 'src/common/decorators/require-feature.decorator'
import { SubscriptionFeatureSlug } from '../enums/subscription-feature-slug.enum'

@Injectable()
export class FeatureEntitlementGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature =
      this.reflector.getAllAndOverride<SubscriptionFeatureSlug>(FEATURE_KEY, [
        context.getHandler(),
        context.getClass(),
      ])

    if (!requiredFeature) {
      return true // Si la ruta no requiere ninguna feature específica, pasa de largo
    }

    const ctx = GqlExecutionContext.create(context)
    const { req } = ctx.getContext()
    const user = req.user // Asumiendo que tu auth guard ya inyecta el usuario en el request

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado.')
    }

    // Usamos el EntitlementsService para verificar si puede realizar la acción
    const canPerform = await this.entitlementsService.canUserPerform(
      user,
      requiredFeature,
    )

    if (!canPerform) {
      throw new ForbiddenException(
        `No tenés habilitada la capacidad: ${requiredFeature}`,
      )
    }

    return true
  }
}
