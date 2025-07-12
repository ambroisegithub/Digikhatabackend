// @ts-nocheck
import type { Request, Response } from "express"
import { LessThanOrEqual } from "typeorm"
import dbConnection from "../database"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { StockMovement } from "../database/models/StockMovement"
import { User } from "../database/models/User"

export class ReportController {
  static async getDashboardSummary(req: Request, res: Response) {
    try {
      const today = new Date()
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)

      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59)

      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)
      const stockMovementRepository = dbConnection.getRepository(StockMovement)

      // Today's sales summary
      const todaysSales = await saleRepository
        .createQueryBuilder("sale")
        .select("SUM(sale.profit)", "totalProfit")
        .addSelect("SUM(sale.totalPrice)", "totalSales")
        .addSelect("COUNT(sale.id)", "totalTransactions")
        .where("sale.salesDate BETWEEN :start AND :end", {
          start: startOfToday,
          end: endOfToday,
        })
        .andWhere("sale.status = :status", { status: "approved" })
        .getRawOne()

      // This month's sales summary
      const monthlyProfit = await saleRepository
        .createQueryBuilder("sale")
        .select("SUM(sale.profit)", "totalProfit")
        .addSelect("SUM(sale.totalPrice)", "totalSales")
        .where("sale.salesDate BETWEEN :start AND :end", {
          start: startOfMonth,
          end: endOfMonth,
        })
        .andWhere("sale.status = :status", { status: "approved" })
        .getRawOne()

      // Last month's profit for comparison
      const lastMonthProfit = await saleRepository
        .createQueryBuilder("sale")
        .select("SUM(sale.profit)", "totalProfit")
        .where("sale.salesDate BETWEEN :start AND :end", {
          start: startOfLastMonth,
          end: endOfLastMonth,
        })
        .andWhere("sale.status = :status", { status: "approved" })
        .getRawOne()

      // Inventory summary
      const inventorySummary = await productRepository
        .createQueryBuilder("product")
        .select("COUNT(product.id)", "totalProducts")
        .addSelect("SUM(product.qtyInStock * product.costPrice)", "totalInventoryValue")
        .addSelect("SUM(product.qtyInStock * (product.price - product.costPrice))", "totalPotentialProfit")
        .addSelect("COUNT(CASE WHEN product.qtyInStock <= product.minStockLevel THEN 1 END)", "lowStockCount")
        .getRawOne()

      // Low stock products
      const lowStockProducts = await productRepository.find({
        where: {
          qtyInStock: LessThanOrEqual(10),
        },
        relations: ["category"],
        take: 5,
        order: { qtyInStock: "ASC" },
      })

      // Recent stock movements
      const recentMovements = await stockMovementRepository.find({
        relations: ["product", "recordedBy"],
        order: { createdAt: "DESC" },
        take: 10,
      })

      // Weekly profit trend (last 7 days)
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const weeklyTrend = await saleRepository
        .createQueryBuilder("sale")
        .select("DATE(sale.salesDate)", "date")
        .addSelect("SUM(sale.profit)", "profit")
        .addSelect("SUM(sale.totalPrice)", "sales")
        .where("sale.salesDate >= :sevenDaysAgo", { sevenDaysAgo })
        .andWhere("sale.status = :status", { status: "approved" })
        .groupBy("DATE(sale.salesDate)")
        .orderBy("DATE(sale.salesDate)", "ASC")
        .getRawMany()

      // Calculate month-over-month change
      const currentMonthProfit = Number(monthlyProfit?.totalProfit || 0)
      const lastMonthProfitValue = Number(lastMonthProfit?.totalProfit || 0)
      const monthlyChange =
        lastMonthProfitValue > 0 ? ((currentMonthProfit - lastMonthProfitValue) / lastMonthProfitValue) * 100 : 0

      res.json({
        success: true,
        data: {
          today: {
            profit: Number(todaysSales?.totalProfit || 0),
            sales: Number(todaysSales?.totalSales || 0),
            transactions: Number(todaysSales?.totalTransactions || 0),
          },
          monthly: {
            profit: currentMonthProfit,
            sales: Number(monthlyProfit?.totalSales || 0),
            change: monthlyChange,
          },
          inventory: {
            totalProducts: Number(inventorySummary?.totalProducts || 0),
            totalValue: Number(inventorySummary?.totalInventoryValue || 0),
            potentialProfit: Number(inventorySummary?.totalPotentialProfit || 0),
            lowStockCount: Number(inventorySummary?.lowStockCount || 0),
          },
          lowStockProducts,
          recentMovements,
          weeklyTrend,
        },
      })
    } catch (error) {
      console.error("Dashboard summary error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard summary",
      })
    }
  }

  // Get profit report by period
  static async getProfitReport(req: Request, res: Response) {
    try {
      const { period = "daily", startDate, endDate } = req.query
      const today = new Date()
      let start: Date, end: Date

      // Determine date range based on period
      switch (period) {
        case "daily":
          start = startDate
            ? new Date(startDate as string)
            : new Date(today.getFullYear(), today.getMonth(), today.getDate())
          end = endDate
            ? new Date(endDate as string)
            : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
          break
        case "weekly":
          const startOfWeek = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000)
          start = startDate ? new Date(startDate as string) : startOfWeek
          end = endDate ? new Date(endDate as string) : today
          break
        case "monthly":
          start = startDate ? new Date(startDate as string) : new Date(today.getFullYear(), today.getMonth(), 1)
          end = endDate
            ? new Date(endDate as string)
            : new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
          break
        default:
          start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      }

      const saleRepository = dbConnection.getRepository(Sale)

      // Get sales data for the period
      const salesData = await saleRepository
        .createQueryBuilder("sale")
        .select("DATE(sale.salesDate)", "date")
        .addSelect("SUM(sale.profit)", "totalProfit")
        .addSelect("SUM(sale.totalPrice)", "totalSales")
        .addSelect("SUM(sale.totalCost)", "totalCost")
        .addSelect("COUNT(sale.id)", "transactionCount")
        .where("sale.salesDate BETWEEN :start AND :end", { start, end })
        .andWhere("sale.status = :status", { status: "approved" })
        .groupBy("DATE(sale.salesDate)")
        .orderBy("DATE(sale.salesDate)", "ASC")
        .getRawMany()

      // Get profit by product category
      const categoryProfit = await saleRepository
        .createQueryBuilder("sale")
        .leftJoin("sale.product", "product")
        .leftJoin("product.category", "category")
        .select("category.name", "categoryName")
        .addSelect("SUM(sale.profit)", "totalProfit")
        .addSelect("SUM(sale.totalPrice)", "totalSales")
        .where("sale.salesDate BETWEEN :start AND :end", { start, end })
        .andWhere("sale.status = :status", { status: "approved" })
        .groupBy("category.name")
        .orderBy("SUM(sale.profit)", "DESC")
        .getRawMany()

      // Get top profitable products
      const topProducts = await saleRepository
        .createQueryBuilder("sale")
        .leftJoin("sale.product", "product")
        .select("product.name", "productName")
        .addSelect("SUM(sale.profit)", "totalProfit")
        .addSelect("SUM(sale.qtySold)", "totalQuantity")
        .addSelect("AVG(sale.profit / sale.qtySold)", "avgProfitPerUnit")
        .where("sale.salesDate BETWEEN :start AND :end", { start, end })
        .andWhere("sale.status = :status", { status: "approved" })
        .groupBy("product.id, product.name")
        .orderBy("SUM(sale.profit)", "DESC")
        .limit(10)
        .getRawMany()

      // Calculate summary
      const summary = {
        totalProfit: salesData.reduce((sum, item) => sum + Number(item.totalProfit || 0), 0),
        totalSales: salesData.reduce((sum, item) => sum + Number(item.totalSales || 0), 0),
        totalTransactions: salesData.reduce((sum, item) => sum + Number(item.transactionCount || 0), 0),
      }

      res.json({
        success: true,
        data: {
          period,
          dateRange: { start, end },
          salesData,
          categoryProfit,
          topProducts,
          summary,
        },
      })
    } catch (error) {
      console.error("Profit report error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to generate profit report",
      })
    }
  }

  // Get product profit history
  static async getProductProfitHistory(req: Request, res: Response) {
    try {
      const { productId } = req.params
      const { period = "30" } = req.query

      const daysBack = Number.parseInt(period as string)
      const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)

      const profitHistory = await saleRepository
        .createQueryBuilder("sale")
        .select("DATE(sale.salesDate)", "date")
        .addSelect("SUM(sale.profit)", "profit")
        .addSelect("SUM(sale.qtySold)", "quantity")
        .addSelect("SUM(sale.totalPrice)", "sales")
        .where("sale.product.id = :productId", { productId })
        .andWhere("sale.salesDate >= :startDate", { startDate })
        .andWhere("sale.status = :status", { status: "approved" })
        .groupBy("DATE(sale.salesDate)")
        .orderBy("DATE(sale.salesDate)", "ASC")
        .getRawMany()

      // Get product details
      const product = await productRepository.findOne({
        where: { id: Number.parseInt(productId) },
        relations: ["category"],
      })

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        })
      }

      // Calculate summary
      const summary = {
        totalProfit: profitHistory.reduce((sum, item) => sum + Number(item.profit || 0), 0),
        totalQuantitySold: profitHistory.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        totalSales: profitHistory.reduce((sum, item) => sum + Number(item.sales || 0), 0),
      }

      res.json({
        success: true,
        data: {
          product,
          profitHistory,
          summary,
        },
      })
    } catch (error) {
      console.error("Product profit history error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch product profit history",
      })
    }
  }
   static getEmployeeStats = async (req: Request, res: Response) => {
    try {
      const userRepository = dbConnection.getRepository(User);
      
      const employees = await userRepository.find({
        where: { role: "employee" },
        relations: ["salesMade", "productsCreated"]
      });

      const stats = employees.map(employee => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        productsCreated: employee.productsCreated?.length || 0,
        salesMade: employee.salesMade?.length || 0,
        totalSalesValue: employee.salesMade?.reduce((sum, sale) => sum + sale.totalPrice, 0) || 0,
        lastActive: employee.lastLoginAt
      }));

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch employee stats"
      });
    }
  };

  // Get profit/loss report
  static getProfitReport = async (req: Request, res: Response) => {
    try {
      const saleRepository = dbConnection.getRepository(Sale);
      
      const sales = await saleRepository.find({
        where: { status: "approved" },
        relations: ["product", "soldBy"]
      });

      const report = {
        totalSales: sales.length,
        totalRevenue: sales.reduce((sum, sale) => sum + sale.totalPrice, 0),
        totalCost: sales.reduce((sum, sale) => sum + sale.totalCost, 0),
        totalProfit: sales.reduce((sum, sale) => sum + sale.profit, 0),
        byEmployee: sales.reduce((acc, sale) => {
          const employeeId = sale.soldBy.id;
          if (!acc[employeeId]) {
            acc[employeeId] = {
              name: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
              sales: 0,
              profit: 0
            };
          }
          acc[employeeId].sales += 1;
          acc[employeeId].profit += sale.profit;
          return acc;
        }, {})
      };

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to generate profit report"
      });
    }
  };
}
