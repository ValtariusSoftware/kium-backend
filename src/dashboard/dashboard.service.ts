import { Injectable } from '@nestjs/common'
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
import { GraphQLError } from 'graphql'

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private saleRepo: Repository<Sale>,
    @InjectRepository(InventoryTransaction)
    private transRepo: Repository<InventoryTransaction>,
    @InjectRepository(Item) private itemRepo: Repository<Item>,
  ) {}

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

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const endOfYesterday = new Date(startOfToday)
    endOfYesterday.setMilliseconds(-1)

    // 1. VENTAS Y GANANCIAS DEL MES (Solo no anuladas)
    const salesMonth = await this.saleRepo.find({
      where: {
        userId,
        createdAt: Between(startOfMonth, now),
        isVoided: false,
      },
      relations: ['items'],
    })

    let totalRevenueProfit = 0
    salesMonth.forEach((sale) => {
      sale.items?.forEach((trans) => {
        const profit =
          (Number(trans.salePriceSnapshot) - Number(trans.unitCostSnapshot)) *
          Math.abs(Number(trans.quantity))
        totalRevenueProfit += profit
      })
    })

    // 2. PÉRDIDAS (Ajustes de salida)
    const lossesTransactions = await this.transRepo.find({
      where: {
        userId,
        type: TransactionType.ADJUSTMENT_OUT,
        createdAt: Between(startOfMonth, now),
      },
    })

    let monthlyLosses = 0
    lossesTransactions.forEach((t) => {
      monthlyLosses += Math.abs(Number(t.quantity)) * Number(t.unitCostSnapshot)
    })

    // 3. BAJO STOCK (Lógica de activación aplicada)
    const lowStockItems = await this.itemRepo
      .createQueryBuilder('item')
      .where('item.userId = :userId', { userId })
      .andWhere('item.minStockAlert IS NOT NULL')
      .andWhere('item.stock <= item.minStockAlert')
      .andWhere(
        `(
      (item.isProduced = false AND EXISTS (
          SELECT 1 FROM stock_control.inventory_transactions t 
          WHERE t.item_id = item.id AND t.type IN ('INITIAL_INVENTORY', 'PURCHASE')
      ))
      OR 
      (item.isProduced = true AND EXISTS (
          SELECT 1 FROM stock_control.recipes r 
          WHERE r.final_product_id = item.id
      ) AND EXISTS (
          SELECT 1 FROM stock_control.inventory_transactions t 
          WHERE t.item_id = item.id AND t.type = 'PRODUCTION_IN'
      ))
    )`,
      )
      .getMany()

    // 4. TOP 3 MÁS VENDIDOS
    const topProductsRaw = await this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .leftJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.isSaleable = :isSaleable', { isSaleable: true })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
      .groupBy('item.name')
      .orderBy('total', 'DESC')
      .limit(3)
      .getRawMany()

    // 5. TOP 3 MENOS VENDIDOS (Solo para PRO)
    let leastSellingProducts: TopProduct[] = []
    if (accessLevel === AccessLevel.PRO) {
      const leastProductsRaw = await this.transRepo
        .createQueryBuilder('t')
        .leftJoin('t.sale', 'sale')
        .leftJoin('t.item', 'item')
        .select('item.name', 'name')
        .addSelect('SUM(ABS(t.quantity))', 'total')
        .where('t.userId = :userId', { userId })
        .andWhere('t.type = :type', { type: TransactionType.SALE })
        .andWhere('item.isSaleable = :isSaleable', { isSaleable: true })
        .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
        .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
        .groupBy('item.name')
        .orderBy('total', 'ASC')
        .limit(3)
        .getRawMany()

      leastSellingProducts = leastProductsRaw.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total),
      }))
    }

    // 6. TENDENCIA (Hoy vs Ayer)
    const countToday = await this.saleRepo.count({
      where: {
        userId,
        createdAt: Between(startOfToday, endOfToday),
        isVoided: false,
      },
    })
    const countYesterday = await this.saleRepo.count({
      where: {
        userId,
        createdAt: Between(startOfYesterday, endOfYesterday),
        isVoided: false,
      },
    })

    return {
      monthlyNetProfit: totalRevenueProfit - monthlyLosses,
      monthlyLosses, // Se usa aquí (corrige error de scope)
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
      totalSalesMonth: salesMonth.length,
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

    const queryBuilder = this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .leftJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total_sold')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.isSaleable = :isSaleable', { isSaleable: true })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
      .groupBy('item.name')

    // 1. Obtenemos el total de productos distintos
    const rawCount = await queryBuilder.getRawMany()
    const total = rawCount.length

    // 2. Obtenemos la página correspondiente
    const res = await queryBuilder
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
    // 1. Validación de Negocio dentro del Service
    if (accessLevel !== AccessLevel.PRO) {
      throw new GraphQLError(
        'Esta es una función exclusiva para usuarios PRO',
        {
          extensions: {
            code: 'ERR_REQUIRES_PRO_PLAN',
            httpStatus: 403, // Opcional, para que tu filtro lo vea
          },
        },
      )
    }

    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    const queryBuilder = this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .leftJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total_sold')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.isSaleable = :isSaleable', { isSaleable: true })
      .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.isVoided = false OR sale.id IS NULL)')
      .groupBy('item.name')

    const rawCount = await queryBuilder.getRawMany()
    const total = rawCount.length

    const res = await queryBuilder
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
  ): Promise<PaginatedSales> {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    const [sales, total] = await this.saleRepo.findAndCount({
      where: {
        userId,
        createdAt: Between(startOfMonth, new Date()),
        isVoided: false,
      },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    })

    // Importante: devolvemos la clave 'sales' para que coincida con tu DTO existente
    return { sales, total }
  }
}
