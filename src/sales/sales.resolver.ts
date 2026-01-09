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
    @Args('userId') userId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedSales> {
    // Si no mandan paginación, usamos los defaults del DTO
    const p = pagination || new PaginationInput()
    return this.salesService.getRecentSales(userId, p)
  }

  @Query(() => PaginatedSales, { name: 'salesByDate' })
  async getSalesByDate(
    @Args('userId') userId: string,
    @Args('date') date: string, // Formato "YYYY-MM-DD"
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedSales> {
    const p = pagination || new PaginationInput()
    return this.salesService.getSalesByDate(userId, date, p)
  }
}
