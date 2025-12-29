// dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import { Sale } from '../sales/entities/sale.entity'
import { InventoryTransaction } from '../inventory-transactions/entities/inventory-transaction.entity'
import { Item, ItemType } from '../items/entities/item.entity'
import { TransactionType } from '../inventory-transactions/enums/transaction-type.enum'
import { DashboardSummary, TopProduct } from './dto/dashboard-summary.type'
import { AccessLevel } from 'src/users/entities/user.entity'
import { PaginationInput } from 'src/common/dto/pagination.input'

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private saleRepo: Repository<Sale>,
    @InjectRepository(InventoryTransaction)
    private transRepo: Repository<InventoryTransaction>,
    @InjectRepository(Item) private itemRepo: Repository<Item>,
  ) {}

  async getHomeSummary(
    userId: string,
    accessLevel: AccessLevel,
  ): Promise<DashboardSummary> {
    const now = new Date()
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    )

    // Configuración para tendencia (Hoy vs Ayer)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const endOfYesterday = new Date(startOfToday)
    endOfYesterday.setMilliseconds(-1)

    // 1. OBTENER VENTAS DEL MES (No anuladas)
    const salesMonth = await this.saleRepo.find({
      where: {
        userId,
        createdAt: Between(startOfMonth, new Date()),
        isVoided: false,
      },
      relations: ['items'],
    })

    let totalRevenueProfit = 0
    salesMonth.forEach((sale) => {
      sale.items?.forEach((trans) => {
        // (Precio Venta - Costo) * Cantidad
        const profit =
          (Number(trans.salePriceSnapshot) - Number(trans.unitCostSnapshot)) *
          Math.abs(Number(trans.quantity))
        totalRevenueProfit += profit
      })
    })

    // 2. OBTENER PÉRDIDAS (Ajustes de salida: robos, roturas, etc.)
    const lossesTransactions = await this.transRepo.find({
      where: {
        userId,
        type: TransactionType.ADJUSTMENT_OUT,
        createdAt: Between(startOfMonth, new Date()),
      },
    })

    let monthlyLosses = 0
    lossesTransactions.forEach((t) => {
      // Valor monetario perdido: Cantidad * Costo
      monthlyLosses += Math.abs(Number(t.quantity)) * Number(t.unitCostSnapshot)
    })

    // 3. BAJO STOCK (Conteo total y preview de 3)
    const lowStockItems = await this.itemRepo
      .createQueryBuilder('item')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.stock <= item.min_stock_alert')
      .getMany()

    // 4. TOP 3 MÁS VENDIDOS (Solo productos de venta)
    const topProductsRaw = await this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .leftJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.type IN (:...itemTypes)', {
        itemTypes: [ItemType.RESELL_PRODUCT, ItemType.FINAL_PRODUCT],
      }) // 👈 Filtro por tipo
      .andWhere('t.created_at >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.is_voided = false OR sale.id IS NULL)')
      .groupBy('item.name')
      .orderBy('total', 'DESC')
      .limit(3)
      .getRawMany()

    // 5. TOP 3 MENOS VENDIDOS (Lógica Condicional PRO)
    let leastSellingProducts: TopProduct[] = []

    if (accessLevel === AccessLevel.PRO) {
      const leastProductsRaw = await this.transRepo
        .createQueryBuilder('t')
        .leftJoin('t.sale', 'sale')
        .leftJoin('t.item', 'item')
        .select('item.name', 'name')
        .addSelect('SUM(ABS(t.quantity))', 'total')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.type = :type', { type: TransactionType.SALE })
        .andWhere('item.type IN (:...itemTypes)', {
          itemTypes: [ItemType.RESELL_PRODUCT, ItemType.FINAL_PRODUCT],
        })
        .andWhere('t.created_at >= :startOfMonth', { startOfMonth })
        .andWhere('(sale.is_voided = false OR sale.id IS NULL)')
        .groupBy('item.name')
        .orderBy('total', 'ASC')
        .limit(3)
        .getRawMany()

      leastSellingProducts = leastProductsRaw.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total),
      }))
    }

    // 6. TENDENCIA DE ACTIVIDAD (Ventas hoy vs ventas ayer)
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
      monthlyNetProfit: totalRevenueProfit - monthlyLosses, // GANANCIA REAL (Ventas - Pérdidas)
      monthlyLosses,
      lowStockCount: lowStockItems.length,
      lowStockPreview: lowStockItems.slice(0, 3),
      topSellingProducts: topProductsRaw.map((p) => ({
        name: p.name,
        quantitySold: parseFloat(p.total),
      })),
      leastSellingProducts,
      totalSalesMonth: salesMonth.length,
      salesTrend: countToday - countYesterday,
    }
  }

  // 1. Ver todos los Más Vendidos (Paginado)
  async getTopSellingDetailed(userId: string, pagination: PaginationInput) {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    return await this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .leftJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.type IN (:...itemTypes)', {
        itemTypes: [ItemType.RESELL_PRODUCT, ItemType.FINAL_PRODUCT],
      })
      .andWhere('t.created_at >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.is_voided = false OR sale.id IS NULL)')
      .groupBy('item.name')
      .orderBy('total', 'DESC')
      .limit(pagination.limit)
      .offset(pagination.offset)
      .getRawMany()
      .then((res) =>
        res.map((p) => ({ name: p.name, quantitySold: parseFloat(p.total) })),
      )
  }

  // 2. Ver todos los Menos Vendidos (Paginado - Solo PRO)
  async getLeastSellingDetailed(userId: string, pagination: PaginationInput) {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    return await this.transRepo
      .createQueryBuilder('t')
      .leftJoin('t.sale', 'sale')
      .leftJoin('t.item', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(ABS(t.quantity))', 'total')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.SALE })
      .andWhere('item.type IN (:...itemTypes)', {
        itemTypes: [ItemType.RESELL_PRODUCT, ItemType.FINAL_PRODUCT],
      })
      .andWhere('t.created_at >= :startOfMonth', { startOfMonth })
      .andWhere('(sale.is_voided = false OR sale.id IS NULL)')
      .groupBy('item.name')
      .orderBy('total', 'ASC')
      .limit(pagination.limit)
      .offset(pagination.offset)
      .getRawMany()
      .then((res) =>
        res.map((p) => ({ name: p.name, quantitySold: parseFloat(p.total) })),
      )
  }

  // 3. Ver todos los productos con Bajo Stock (Paginado)
  async getLowStockDetailed(userId: string, pagination: PaginationInput) {
    return await this.itemRepo
      .createQueryBuilder('item')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.stock <= item.min_stock_alert')
      .orderBy('item.stock', 'ASC')
      .limit(pagination.limit)
      .offset(pagination.offset)
      .getMany()
  }

  // 4. Ver todas las Ventas del Mes (Paginado)
  async getMonthlySalesDetailed(userId: string, pagination: PaginationInput) {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )

    return await this.saleRepo.find({
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
  }
}
