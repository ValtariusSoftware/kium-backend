// sales/sales.resolver.ts

import { Resolver, Mutation, Args, Query } from '@nestjs/graphql'
import { SalesService } from './sales.service'
import { Sale } from './entities/sale.entity'
import { CreateSaleInput } from './dto/create-sale.input'

import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'

@Resolver(() => Sale)
export class SalesResolver {
  constructor(private readonly salesService: SalesService) {}

  @Mutation(() => Sale)
  async createSale(
    @CurrentUser() user: User,
    @Args('createSaleInput') createSaleInput: CreateSaleInput,
  ): Promise<Sale> {
    return this.salesService.createSale(user.id, createSaleInput)
  }

  @Query(() => [Sale], { name: 'sales' })
  async findAll(@CurrentUser() user: User): Promise<Sale[]> {
    // Implementación rápida para ver el historial
    return this.salesService.findAllByUser(user.id)
  }

  @Mutation(() => Sale)
  async voidSale(
    @CurrentUser() user: User,
    @Args('saleId', { type: () => String }) saleId: string,
  ): Promise<Sale> {
    return this.salesService.voidSale(user.id, saleId)
  }
}
