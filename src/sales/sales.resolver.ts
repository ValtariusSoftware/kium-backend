// sales/sales.resolver.ts

import { Resolver, Mutation, Args, Query } from '@nestjs/graphql'
import { SalesService } from './sales.service'
import { Sale } from './entities/sale.entity'
import { CreateSaleInput } from './dto/create-sale.input'

import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { PaginatedSales } from './dto/paginated-sales.output'
import { PaginationInput } from 'src/common/dto/pagination.input'

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

  @Mutation(() => Sale)
  async voidSale(
    @CurrentUser() user: User,
    @Args('saleId', { type: () => String }) saleId: string,
  ): Promise<Sale> {
    return this.salesService.voidSale(user.id, saleId)
  }

  @Query(() => PaginatedSales, { name: 'recentSales' })
  async getRecentSales(
    @CurrentUser() user: User, // 👈 Cambiado: Usamos el usuario autenticado
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedSales> {
    const p = pagination || new PaginationInput()
    return this.salesService.getRecentSales(user.id, p)
  }

  @Query(() => PaginatedSales, { name: 'salesByDate' })
  async getSalesByDate(
    @CurrentUser() user: User, // 👈 Cambiado: Seguridad ante todo
    @Args('date') date: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedSales> {
    const p = pagination || new PaginationInput()
    return this.salesService.getSalesByDate(user.id, date, p)
  }
}
