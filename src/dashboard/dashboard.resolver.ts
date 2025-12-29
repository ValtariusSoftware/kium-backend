// dashboard/dashboard.resolver.ts
import { Resolver, Query, Args } from '@nestjs/graphql'
import { DashboardService } from './dashboard.service'
import { DashboardSummary, TopProduct } from './dto/dashboard-summary.type'
import { AccessLevel, User } from '../users/entities/user.entity'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { Item } from 'src/items/entities/item.entity'
import { Sale } from 'src/sales/entities/sale.entity'

@Resolver()
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardSummary, { name: 'getHomeDashboard' })
  async getHomeDashboard(@CurrentUser() user: User) {
    return this.dashboardService.getHomeSummary(user.id, user.accessLevel)
  }

  @Query(() => [TopProduct])
  async getTopSellingDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ) {
    return this.dashboardService.getTopSellingDetailed(
      user.id,
      pagination ?? new PaginationInput(),
    )
  }

  @Query(() => [TopProduct])
  async getLeastSellingDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ) {
    if (user.accessLevel !== AccessLevel.PRO) {
      throw new Error('Esta es una función exclusiva para usuarios PRO')
    }
    return this.dashboardService.getLeastSellingDetailed(
      user.id,
      pagination ?? new PaginationInput(),
    )
  }

  @Query(() => [Item], { name: 'getLowStockDetailed' })
  async getLowStockDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ) {
    return this.dashboardService.getLowStockDetailed(
      user.id,
      pagination ?? new PaginationInput(),
    )
  }

  @Query(() => [Sale], { name: 'getMonthlySalesDetailed' })
  async getMonthlySalesDetailed(
    @CurrentUser() user: User,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ) {
    return this.dashboardService.getMonthlySalesDetailed(
      user.id,
      pagination ?? new PaginationInput(),
    )
  }
}
