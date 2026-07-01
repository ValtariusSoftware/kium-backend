import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import { Sale } from '../sales/entities/sale.entity'
import { InventoryTransaction } from '../inventory-transactions/entities/inventory-transaction.entity'
import { Item } from '../items/entities/item.entity'
import { TransactionType } from '../inventory-transactions/enums/transaction-type.enum'
import { DashboardSummary, TopProduct } from './dto/dashboard-summary.type'
import { AccessLevel } from 'src/users/entities/user.entity'
import { PaginationInput } from 'src/common/dto/pagination.input'
import { PaginatedLowStock } from './dto/paginated-low-stock.output'
import { PaginatedSales } from 'src/sales/dto/paginated-sales.output'
import { PaginatedTopProducts } from './dto/paginated-top-products.output'
// import { GraphQLError } from 'graphql'
import { SalesFilterInput } from './dto/sales-filter.input'
import { ItemErrorCode } from 'src/items/enums/item-error-code.enum'

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private saleRepo: Repository<Sale>,
    @InjectRepository(InventoryTransaction)
    private transRepo: Repository<InventoryTransaction>,
    @InjectRepository(Item) private itemRepo: Repository<Item>,
  ) {}

  private calculateFinancials(transactions: InventoryTransaction[]): {
    revenue: number
    cost: number
    losses: number
  } {
    let revenue = BigInt(0)
    let cost = BigInt(0)
    let losses = BigInt(0)

    transactions.forEach((t) => {
      // La cantidad sigue siendo decimal (ej: 1.5kg), los precios son enteros (centavos)
      const qty = Math.abs(Number(t.quantity))
      const unitCost = BigInt(t.unitCostSnapshot || 0)
      const salePrice = BigInt(t.salePriceSnapshot || 0)

      // Multiplicamos precio (BigInt) por cantidad (Number)
      // Nota: Convertimos qty a centésimas si quieres máxima precisión,
      // pero para un dashboard, esto es suficiente:
      const lineRevenue = BigInt(Math.round(qty * Number(salePrice)))
      const lineCost = BigInt(Math.round(qty * Number(unitCost)))

      if (t.type === TransactionType.SALE) {
        revenue += lineRevenue
        cost += lineCost
      } else if (t.type === TransactionType.RETURN_FROM_SALE) {
        revenue -= lineRevenue
        cost -= lineCost
      } else if (
        t.type === TransactionType.CONSUMPTION ||
        t.type === TransactionType.PRODUCTION_OUT
      ) {
        cost += lineCost
      } else if (t.type === TransactionType.ADJUSTMENT_OUT) {
        losses += lineCost
      }
    })

    return {
      revenue: Number(revenue),
      cost: Number(cost),
      losses: Number(losses),
    }
  }
  /**
   * Resumen para la pantalla principal del Dashboard.
   * Calcula ganancias, pérdidas, stock bajo, tendencias y rankings.
   */

  async getHomeSummary(
    userId: string,
    accessLevel: AccessLevel,
  ): Promise<DashboardSummary> {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Fechas para tendencia (Hoy vs Ayer)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const endOfYesterday = new Date(startOfToday)
    endOfYesterday.setMilliseconds(-1)

    // 1. CÁLCULO DE FINANZAS (Optimizado en SQL)
    // Delegamos la suma a la DB para evitar traer miles de filas a memoria.
    // 1. CÁLCULO DE FINANZAS (Optimizado en SQL)
    const financials = await this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .select(
        `SUM(CASE 
    WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.salePriceSnapshot 
    WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.salePriceSnapshot 
    ELSE 0 END)`,
        'revenue',
      )
      //   .addSelect(
      //     `SUM(CASE
      // WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.unit_cost_snapshot
      // WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.unit_cost_snapshot
      // WHEN t.type IN ('CONSUMPTION', 'PRODUCTION_OUT') THEN ABS(t.quantity) * t.unit_cost_snapshot
      // ELSE 0 END)`,
      //     'cost',
      //   )
      .addSelect(
        `SUM(CASE 
        WHEN t.type = 'SALE' THEN ABS(t.quantity) * t.unit_cost_snapshot 
        WHEN t.type = 'RETURN_FROM_SALE' AND t.documentRef NOT LIKE 'VOID-%' THEN -ABS(t.quantity) * t.unit_cost_snapshot 
        ELSE 0 END)`, // Solo costos de venta (COGS)
        'cost',
      )
      .addSelect(
        `SUM(CASE 
    WHEN t.type = 'ADJUSTMENT_OUT' THEN ABS(t.quantity) * t.unit_cost_snapshot 
    ELSE 0 END)`,
        'losses',
      )
      .where('t.userId = :userId', { userId })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
      .getRawOne()

    const rev = Number(financials.revenue || 0)
    const cst = Number(financials.cost || 0)
    const los = Number(financials.losses || 0)

    // 2. CONTEO DE VENTAS REALES (Transacciones de venta, no ítems)
    const totalSalesMonth = await this.saleRepo.count({
      where: {
        userId,
        createdAt: Between(startOfMonth, now),
        isVoided: false,
      },
    })

    // 3. BAJO STOCK (Con lógica de activación operativa)
    const lowStockItems = await this.itemRepo
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .andWhere('item.minStockAlert IS NOT NULL')
      .andWhere('item.stock <= item.minStockAlert')
      .andWhere(
        `((item.isProduced = false AND EXISTS (
            SELECT 1 FROM stock_control.inventory_transactions t 
            WHERE t.item_id = item.id AND t.type IN ('INITIAL_INVENTORY', 'PURCHASE')
        ))
        OR 
        (item.isProduced = true AND EXISTS (
            SELECT 1 FROM stock_control.recipes r WHERE r.final_product_id = item.id
        ) AND EXISTS (
            SELECT 1 FROM stock_control.inventory_transactions t 
            WHERE t.item_id = item.id AND t.type = 'PRODUCTION_IN'
        )))`,
      )
      .getMany()

    // 4. RANKING: TOP 5 MÁS VENDIDOS
    const topProductsRaw = await this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .innerJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
      .groupBy('item.id')
      .addGroupBy('item.name')
      .orderBy('total', 'DESC')
      .limit(5)
      .getRawMany()

    // 5. RANKING: TOP 5 MENOS VENDIDOS (Solo PRO)
    let leastSellingProducts: TopProduct[] = []
    if (accessLevel === AccessLevel.PRO) {
      const leastRaw = await this.transRepo
        .createQueryBuilder('t')
        .leftJoin('t.sale', 'sale')
        .innerJoin('t.item', 'item')
        .select('item.name', 'name')
        .addSelect('SUM(ABS(t.quantity))', 'total')
        .where('t.userId = :userId', { userId })
        .andWhere('t.type = :type', { type: TransactionType.SALE })
        .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
        .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
        .groupBy('item.id')
        .addGroupBy('item.name')
        .orderBy('total', 'ASC')
        .limit(5)
        .getRawMany()

      leastSellingProducts = leastRaw.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total),
      }))
    }

    // 6. TENDENCIA (Ejecutado en paralelo para ganar velocidad)
    const [countToday, countYesterday] = await Promise.all([
      this.saleRepo.count({
        where: {
          userId,
          isVoided: false,
          createdAt: Between(startOfToday, endOfToday),
        },
      }),
      this.saleRepo.count({
        where: {
          userId,
          isVoided: false,
          createdAt: Between(startOfYesterday, endOfYesterday),
        },
      }),
    ])

    return {
      monthlyNetProfit: rev - cst - los, // Ya son centavos enteros
      monthlyLosses: los,
      lowStockCount: lowStockItems.length,
      lowStockPreview: lowStockItems.slice(0, 3).map((i) => ({
        id: i.id,
        name: i.name,
        stock: i.stock,
        minStockAlert: i.minStockAlert,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
      topSellingProducts: topProductsRaw.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total),
      })),
      leastSellingProducts,
      totalSalesMonth,
      salesTrend: countToday - countYesterday,
    }
  }

  /**
   * Obtiene el ranking detallado de los productos más vendidos del mes.
   * Calcula el total de productos distintos vendidos para la paginación.
   */

  async getTopSellingDetailed(
    userId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedTopProducts> {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    // 1. Base del Query (La definimos una vez)
    const baseQuery = this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .innerJoin('t.item', 'item') // Inner join porque si no hay item, no hay ranking
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.isSaleable = :isSaleable', { isSaleable: true })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')

    // 2. Conteo eficiente de productos distintos
    const countResult = await baseQuery
      .select('COUNT(DISTINCT item.id)', 'count')
      .getRawOne()
    const total = parseInt(countResult?.count || '0', 10)

    // 3. Obtención de datos paginados
    const res = await baseQuery
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total_sold')
      .groupBy('item.id') // Agrupamos por ID para evitar problemas con nombres duplicados
      .addGroupBy('item.name')
      .orderBy('total_sold', 'DESC')
      .limit(pagination.limit)
      .offset(pagination.offset)
      .getRawMany()

    return {
      items: res.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total_sold),
      })),
      total,
    }
  }

  /**
   * Obtiene el ranking detallado de los productos MENOS vendidos del mes (Solo PRO).
   * Útil para identificar productos "clavo" o que necesitan rotación.
   * Retorna el nombre, la cantidad total vendida y el conteo total para paginación.
   */

  async getLeastSellingDetailed(
    userId: string,
    accessLevel: AccessLevel,
    pagination: PaginationInput,
  ): Promise<PaginatedTopProducts> {
    if (accessLevel !== AccessLevel.PRO) {
      throw new ForbiddenException(ItemErrorCode.PRO_FEATURE_ONLY)
    }

    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    const baseQuery = this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .innerJoin('t.item', 'item')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.isSaleable = :isSaleable', { isSaleable: true })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')

    // Conteo eficiente
    const countResult = await baseQuery
      .select('COUNT(DISTINCT item.id)', 'count')
      .getRawOne()
    const total = parseInt(countResult?.count || '0', 10)

    // Datos paginados (ASC para los menos vendidos)
    const res = await baseQuery
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total_sold')
      .groupBy('item.id')
      .addGroupBy('item.name')
      .orderBy('total_sold', 'ASC')
      .limit(pagination.limit)
      .offset(pagination.offset)
      .getRawMany()

    return {
      items: res.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total_sold),
      })),
      total,
    }
  }

  /**
   * Obtiene productos con stock crítico (bajo el mínimo configurado).
   * Filtra por activación operativa:
   * - Reventa: Al menos un ingreso de stock (Inicial o Compra).
   * - Producidos: Al menos una receta cargada Y al menos una producción realizada.
   */
  async getLowStockDetailed(
    userId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedLowStock> {
    const query = this.itemRepo
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .andWhere('item.minStockAlert IS NOT NULL')
      .andWhere('item.stock <= item.minStockAlert')
      .andWhere(
        `(
      -- CASO REVENTA: Debe haber tenido ingresos físicos previos
      (item.isProduced = false AND EXISTS (
          SELECT 1 FROM stock_control.inventory_transactions t 
          WHERE t.item_id = item.id AND t.type IN ('INITIAL_INVENTORY', 'PURCHASE')
      ))
      OR 
      -- CASO PRODUCIDO: Debe tener receta Y haber operado (producido) al menos una vez
      (item.isProduced = true AND EXISTS (
          SELECT 1 FROM stock_control.recipes r 
          WHERE r.final_product_id = item.id
      ) AND EXISTS (
          SELECT 1 FROM stock_control.inventory_transactions t 
          WHERE t.item_id = item.id AND t.type = 'PRODUCTION_IN'
      ))
    )`,
      )
      .orderBy('item.stock', 'ASC')

    const [items, total] = await query
      .limit(pagination.limit)
      .offset(pagination.offset)
      .getManyAndCount()

    return { items, total }
  }

  /**
   * Obtiene el listado detallado de ventas del mes en curso.
   * Filtra por usuario, ventas no anuladas y dentro del mes actual.
   * Retorna los datos paginados junto con el total para gestión de listas en la App.
   */

  async getMonthlySalesDetailed(
    userId: string,
    pagination: PaginationInput,
    filters?: SalesFilterInput, // 👈 Nuevo parámetro
  ): Promise<PaginatedSales> {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    // Construcción dinámica del filtro
    const whereCondition: any = {
      userId,
      createdAt: Between(startOfMonth, new Date()),
    }

    if (filters?.paymentMethod) {
      whereCondition.paymentMethod = filters.paymentMethod
    }

    if (filters?.isVoided !== undefined) {
      whereCondition.isVoided = filters.isVoided
    }

    const [sales, total] = await this.saleRepo.findAndCount({
      where: whereCondition,
      relations: ['items', 'items.item'],
      order: { createdAt: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    })

    return { sales, total }
  }
}
