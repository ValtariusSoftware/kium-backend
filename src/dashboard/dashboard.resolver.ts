// dashboard/dashboard.resolver.ts
import { Resolver, Query, Args } from '@nestjs/graphql'
import { DashboardService } from './dashboard.service'
import { DashboardSummary } from './dto/dashboard-summary.type'
import { User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { PaginatedLowStock } from './dto/paginated-low-stock.output'
import { PaginatedSales } from 'src/sales/dto/paginated-sales.output'
import { PaginatedTopProducts } from './dto/paginated-top-products.output'
import { SalesFilterInput } from './dto/sales-filter.input'

@Resolver()
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardSummary, { name: 'getHomeDashboard' })
  async getHomeDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getHomeSummary(user.id, user.accessLevel)
  }

  @Query(() => PaginatedTopProducts, { name: 'getTopSellingDetailed' })
  async getTopSellingDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedTopProducts> {
    return this.dashboardService.getTopSellingDetailed(
      user.id,
      pagination ?? new PaginationInput(),
    )
  }

  @Query(() => PaginatedTopProducts, { name: 'getLeastSellingDetailed' })
  async getLeastSellingDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedTopProducts> {
    return this.dashboardService.getLeastSellingDetailed(
      user.id,
      user.accessLevel, // Pasamos el nivel de acceso al service
      pagination ?? new PaginationInput(),
    )
  }
  @Query(() => PaginatedLowStock, { name: 'getLowStockDetailed' })
  async getLowStockDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PaginatedLowStock> {
    return this.dashboardService.getLowStockDetailed(
      user.id,
      pagination ?? new PaginationInput(),
    )
  }

  @Query(() => PaginatedSales, { name: 'getMonthlySalesDetailed' })
  async getMonthlySalesDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('filter', { nullable: true }) filter?: SalesFilterInput, // 👈 Nuevo argumento
  ): Promise<PaginatedSales> {
    return this.dashboardService.getMonthlySalesDetailed(
      user.id,
      pagination ?? new PaginationInput(),
      filter,
    )
  }
}
