// @ts-nocheck
import type { Request, Response } from "express"
import dbConnection from "../database"
import { User } from "../database/models/User"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { Between, LessThanOrEqual } from "typeorm"
import { UserRole } from "../Enums/UserRole"
import { subDays } from "date-fns"

// Debug utility function
const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
}


export class AdminController {

  static async getDashboardOverview(req: Request, res: Response) {
    try {
      debugLog("ADMIN_DASHBOARD - Request", { userId: req.userId })

      const userRepository = dbConnection.getRepository(User)
      const productRepository = dbConnection.getRepository(Product)
      const saleRepository = dbConnection.getRepository(Sale)

      // Get date ranges
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

      // Yesterday's date range
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
      const endOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59)

      // Week and month ranges
      const startOfWeek = subDays(today, 7)
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

      // Parallel data fetching for better performance
      const [
        employees,
        totalProducts,
        lowStockProducts,
        criticalStockProducts,
        todaySales,
        yesterdaySales,
        weeklySales,
        monthlySales,
        pendingSalesCount,
        approvedSalesCount
      ] = await Promise.all([
        // Get all employees
        userRepository.find({
          where: { role: UserRole.EMPLOYEE },
          select: ["id", "firstName", "lastName", "email", "isActive", "createdAt", "lastLoginAt"],
          order: { createdAt: "DESC" },
        }),

        // Get total products
        productRepository.count(),

        // Get low stock products count
        productRepository
          .createQueryBuilder("product")
          .where("product.qtyInStock <= product.minStockLevel")
          .getCount(),

        // Get critical stock products (stock <= 5)
        productRepository.find({
          where: {
            qtyInStock: LessThanOrEqual(5)
          },
          select: ["id", "name", "qtyInStock", "minStockLevel"],
          take: 5,
          order: {
            qtyInStock: "ASC"
          }
        }),

        // Today's sales
        saleRepository.find({
          where: {
            salesDate: Between(startOfDay, endOfDay),
            status: "approved",
          },
          relations: ["soldBy", "product"],
          order: { salesDate: "DESC" }
        }),

        // Yesterday's sales
        saleRepository.find({
          where: {
            salesDate: Between(startOfYesterday, endOfYesterday),
            status: "approved",
          }
        }),

        // Weekly sales
        saleRepository.find({
          where: {
            salesDate: Between(startOfWeek, endOfDay),
            status: "approved",
          }
        }),

        // Monthly sales
        saleRepository.find({
          where: {
            salesDate: Between(startOfMonth, endOfDay),
            status: "approved",
          }
        }),

        // Pending sales count
        saleRepository.count({
          where: { status: "pending" },
        }),

        // Total approved sales count
        saleRepository.count({
          where: { status: "approved" },
        })
      ])

      // Calculate today's metrics
      const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const todayProfit = todaySales.reduce((sum, sale) => sum + Number(sale.profit), 0)

      // Calculate yesterday's metrics
      const yesterdayRevenue = yesterdaySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const yesterdayProfit = yesterdaySales.reduce((sum, sale) => sum + Number(sale.profit), 0)

      // Calculate weekly metrics
      const weeklyRevenue = weeklySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)

      // Calculate monthly metrics
      const monthlyRevenue = monthlySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)

      // Calculate comparison percentages
      const revenueChange = yesterdayRevenue > 0 
        ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 
        : todayRevenue > 0 ? 100 : 0

      const profitChange = yesterdayProfit > 0 
        ? ((todayProfit - yesterdayProfit) / yesterdayProfit) * 100 
        : todayProfit > 0 ? 100 : 0

      // Format critical stock products
      const criticalStockFormatted = criticalStockProducts.map(product => ({
        id: product.id,
        name: product.name,
        stock: product.qtyInStock,
        minStock: product.minStockLevel
      }))

    const recentSalesFormatted = todaySales.slice(0, 5).map(sale => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      totalPrice: sale.totalPrice,
      profit: sale.profit,
      soldBy: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
      time: sale.salesDate,
      productName: sale.product.name
    }))

      // Generate quick actions based on current state
      const quickActions = []
      
      if (pendingSalesCount > 0) {
        quickActions.push({
          id: 1,
          title: "Approve Sales",
          icon: "check-circle",
          count: pendingSalesCount
        })
      }

      if (criticalStockProducts.length > 0) {
        quickActions.push({
          id: 2,
          title: "Restock Items",
          icon: "package",
          count: criticalStockProducts.length
        })
      }

      quickActions.push({
        id: 3,
        title: "Add Employee",
        icon: "user-plus"
      })

      if (todaySales.length === 0 && new Date().getHours() > 10) {
        quickActions.push({
          id: 4,
          title: "Check Sales Activity",
          icon: "trending-down"
        })
      }

      // Enhanced dashboard response structure
      const enhancedDashboardData = {
        summary: {
          today: {
            revenue: todayRevenue,
            profit: todayProfit,
            transactions: todaySales.length,
            pendingSales: pendingSalesCount,
            comparison: {
              revenueChange: Math.round(revenueChange * 100) / 100,
              profitChange: Math.round(profitChange * 100) / 100
            }
          },
          week: {
            revenue: weeklyRevenue,
            transactions: weeklySales.length
          },
          month: {
            revenue: monthlyRevenue,
            transactions: monthlySales.length
          }
        },
        employees: {
          total: employees.length,
          active: employees.filter(emp => emp.isActive).length
        },
        inventory: {
          totalProducts: totalProducts,
          lowStock: lowStockProducts,
          criticalStock: criticalStockFormatted
        },
        recentActivity: {
          sales: recentSalesFormatted,
          pendingApprovals: pendingSalesCount
        },
        quickActions: quickActions,
        
        // Keep original structure for backward compatibility
        legacy: {
          employees: {
            total: employees.length,
            active: employees.filter(emp => emp.isActive).length,
            list: employees,
          },
          products: {
            total: totalProducts,
            lowStock: lowStockProducts,
          },
          todayMetrics: {
            revenue: todayRevenue,
            profit: todayProfit,
            transactions: todaySales.length,
            pendingSales: pendingSalesCount,
          },
          recentSales: todaySales.slice(0, 10).map(sale => ({
            id: sale.id,
            saleNumber: sale.saleNumber,
            totalPrice: sale.totalPrice,
            profit: sale.profit,
            soldBy: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
            salesDate: sale.salesDate,
            productName: sale.product.name

          })),
        }
      }

      debugLog("ADMIN_DASHBOARD - Success", {
        employeesCount: employees.length,
        todayRevenue,
        todayProfit,
        revenueChange,
        profitChange,
        criticalStockCount: criticalStockProducts.length
      })

      return res.json({
        success: true,
        message: "Dashboard data retrieved successfully",
        data: enhancedDashboardData,
      })
    } catch (error) {
      debugLog("ADMIN_DASHBOARD - Error", error)
      console.error("Admin dashboard error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard data",
      })
    }
  }

  // ✅ Fix 2: Daily sales aggregation for all employees
  static async getDailySalesAggregation(req: Request, res: Response) {
    try {
      const { date, period = "today" } = req.query
      const saleRepository = dbConnection.getRepository(Sale)

      let startDate: Date, endDate: Date
      const now = new Date()

      // Determine date range
      switch (period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
          break
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          endDate = now
          break
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
          break
        default:
          if (date) {
            const targetDate = new Date(date as string)
            startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
            endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59)
          } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
          }
      }

      // Get sales data with employee information
      const sales = await saleRepository.find({
        where: {
          salesDate: Between(startDate, endDate),
          status: "approved",
        },
        relations: ["soldBy", "product"],
      })

      // Group by employee and date
      const employeeDailySales = sales.reduce((acc, sale) => {
        const employeeId = sale.soldBy.id
        const employeeName = `${sale.soldBy.firstName} ${sale.soldBy.lastName}`
        const dateKey = sale.salesDate.toISOString().split("T")[0]

        if (!acc[employeeId]) {
          acc[employeeId] = {
            employeeId,
            employeeName,
            dailyBreakdown: {},
            totalSales: 0,
            totalProfit: 0,
            totalTransactions: 0,
          }
        }

        if (!acc[employeeId].dailyBreakdown[dateKey]) {
          acc[employeeId].dailyBreakdown[dateKey] = {
            date: dateKey,
            sales: 0,
            profit: 0,
            transactions: 0,
          }
        }

        acc[employeeId].dailyBreakdown[dateKey].sales += Number(sale.totalPrice)
        acc[employeeId].dailyBreakdown[dateKey].profit += Number(sale.profit)
        acc[employeeId].dailyBreakdown[dateKey].transactions += 1

        acc[employeeId].totalSales += Number(sale.totalPrice)
        acc[employeeId].totalProfit += Number(sale.profit)
        acc[employeeId].totalTransactions += 1

        return acc
      }, {})

      // Convert to array and sort by total sales
      const aggregatedData = Object.values(employeeDailySales).sort((a: any, b: any) => b.totalSales - a.totalSales)

      // Calculate overall summary
      const overallSummary = {
        period,
        dateRange: { start: startDate, end: endDate },
        totalEmployees: aggregatedData.length,
        totalSales: aggregatedData.reduce((sum: number, emp: any) => sum + emp.totalSales, 0),
        totalProfit: aggregatedData.reduce((sum: number, emp: any) => sum + emp.totalProfit, 0),
        totalTransactions: aggregatedData.reduce((sum: number, emp: any) => sum + emp.totalTransactions, 0),
        topPerformer: aggregatedData[0] || null,
      }

      return res.json({
        success: true,
        message: "Daily sales aggregation retrieved successfully",
        data: {
          summary: overallSummary,
          employeeBreakdown: aggregatedData,
        },
      })
    } catch (error) {
      console.error("Daily sales aggregation error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch daily sales aggregation",
      })
    }
  }

  // ✅ Fix 6: Profit/Loss analysis per product and category
  static async getProfitAnalysis(req: Request, res: Response) {
    try {
      const { period = "30", categoryId, employeeId } = req.query
      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)

      const daysBack = Number.parseInt(period as string)
      const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

      // Build query conditions
      let queryBuilder = saleRepository
        .createQueryBuilder("sale")
        .leftJoinAndSelect("sale.product", "product")
        .leftJoinAndSelect("product.category", "category")
        .leftJoinAndSelect("sale.soldBy", "soldBy")
        .where("sale.status = :status", { status: "approved" })
        .andWhere("sale.salesDate >= :startDate", { startDate })

      if (categoryId) {
        queryBuilder = queryBuilder.andWhere("product.category.id = :categoryId", { categoryId })
      }

      if (employeeId) {
        queryBuilder = queryBuilder.andWhere("sale.soldBy.id = :employeeId", { employeeId })
      }

      const sales = await queryBuilder.getMany()

      // Analyze by product
      const productAnalysis = sales.reduce((acc, sale) => {
        const productId = sale.product.id
        if (!acc[productId]) {
          acc[productId] = {
            productId,
            productName: sale.product.name,
            categoryName: sale.product.category.name,
            totalSales: 0,
            totalProfit: 0,
            totalQuantitySold: 0,
            salesCount: 0,
            avgSaleValue: 0,
            profitMargin: 0,
          }
        }

        acc[productId].totalSales += Number(sale.totalPrice)
        acc[productId].totalProfit += Number(sale.profit)
        acc[productId].totalQuantitySold += Number(sale.qtySold)
        acc[productId].salesCount += 1

        return acc
      }, {})

      // Calculate averages and margins
      Object.values(productAnalysis).forEach((product: any) => {
        product.avgSaleValue = product.totalSales / product.salesCount
        product.profitMargin = product.totalSales > 0 ? (product.totalProfit / product.totalSales) * 100 : 0
      })

      // Analyze by category
      const categoryAnalysis = sales.reduce((acc, sale) => {
        const categoryId = sale.product.category.id
        const categoryName = sale.product.category.name

        if (!acc[categoryId]) {
          acc[categoryId] = {
            categoryId,
            categoryName,
            totalSales: 0,
            totalProfit: 0,
            totalQuantitySold: 0,
            salesCount: 0,
            productCount: new Set(),
          }
        }

        acc[categoryId].totalSales += Number(sale.totalPrice)
        acc[categoryId].totalProfit += Number(sale.profit)
        acc[categoryId].totalQuantitySold += Number(sale.qtySold)
        acc[categoryId].salesCount += 1
        acc[categoryId].productCount.add(sale.product.id)

        return acc
      }, {})

      // Convert sets to counts
      Object.values(categoryAnalysis).forEach((category: any) => {
        category.uniqueProducts = category.productCount.size
        delete category.productCount
        category.profitMargin = category.totalSales > 0 ? (category.totalProfit / category.totalSales) * 100 : 0
      })

      // Overall summary
      const overallSummary = {
        period: `${period} days`,
        totalSales: sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0),
        totalProfit: sales.reduce((sum, sale) => sum + Number(sale.profit), 0),
        totalTransactions: sales.length,
        profitMargin:
          sales.length > 0
            ? (sales.reduce((sum, sale) => sum + Number(sale.profit), 0) /
                sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)) *
              100
            : 0,
        topProduct: Object.values(productAnalysis).sort((a: any, b: any) => b.totalProfit - a.totalProfit)[0] || null,
        topCategory: Object.values(categoryAnalysis).sort((a: any, b: any) => b.totalProfit - a.totalProfit)[0] || null,
      }

      return res.json({
        success: true,
        message: "Profit analysis retrieved successfully",
        data: {
          summary: overallSummary,
          productAnalysis: Object.values(productAnalysis).sort((a: any, b: any) => b.totalProfit - a.totalProfit),
          categoryAnalysis: Object.values(categoryAnalysis).sort((a: any, b: any) => b.totalProfit - a.totalProfit),
        },
      })
    } catch (error) {
      console.error("Profit analysis error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch profit analysis",
      })
    }
  }

  // Approve sale with timestamp logging
  static async approveSale(req: Request, res: Response) {
    try {
      const { saleId } = req.params
      const saleRepository = dbConnection.getRepository(Sale)

      const sale = await saleRepository.findOne({
        where: { id: Number(saleId) },
        relations: ["product", "soldBy"],
      })

      if (!sale) {
        return res.status(404).json({
          success: false,
          message: "Sale not found",
        })
      }

      if (sale.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Sale is not pending approval",
        })
      }

      // ✅ Fix 7: Log approval timestamp
      sale.status = "approved"
      sale.approvedBy = req.user
      sale.approvedAt = new Date()

      await saleRepository.save(sale)

      return res.json({
        success: true,
        message: "Sale approved successfully",
        data: sale,
      })
    } catch (error) {
      console.error("Approve sale error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to approve sale",
      })
    }
  }

  // Reject sale with timestamp logging
  static async rejectSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const { saleId } = req.params
      const { reason } = req.body

      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: Number(saleId) },
        relations: ["product", "soldBy"],
      })

      if (!sale) {
        await queryRunner.rollbackTransaction()
        return res.status(404).json({
          success: false,
          message: "Sale not found",
        })
      }

      if (sale.status !== "pending") {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          success: false,
          message: "Sale is not pending approval",
        })
      }

      // Update sale status
      sale.status = "rejected"
      sale.approvedBy = req.user
      sale.approvedAt = new Date()
      sale.notes = reason || "Sale rejected by admin"

      await queryRunner.manager.save(sale)

      // Restore product stock
      await queryRunner.manager.update(Product, sale.product.id, {
        qtyInStock: sale.product.qtyInStock + sale.qtySold,
      })

      await queryRunner.commitTransaction()

      return res.json({
        success: true,
        message: "Sale rejected successfully",
        data: sale,
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Reject sale error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to reject sale",
      })
    } finally {
      await queryRunner.release()
    }
  }

  // Get all employees with performance metrics
  static async getAllEmployeesWithPerformance(req: Request, res: Response) {
    try {
      const userRepository = dbConnection.getRepository(User)
      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)

      const employees = await userRepository.find({
        where: { role: UserRole.EMPLOYEE },
        select: ["id", "firstName", "lastName", "email", "telephone", "isActive", "createdAt", "lastLoginAt"],
        order: { createdAt: "DESC" },
      })

      // Get performance data for each employee
      const employeesWithPerformance = await Promise.all(
        employees.map(async (employee) => {
          // Get sales data
          const sales = await saleRepository.find({
            where: { soldBy: { id: employee.id }, status: "approved" },
          })

          // Get products created by employee
          const productsCreated = await productRepository.count({
            where: { createdBy: { id: employee.id } },
          })

          const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
          const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)

          return {
            ...employee,
            performance: {
              totalSales,
              totalProfit,
              totalTransactions: sales.length,
              productsCreated,
              avgSaleValue: sales.length > 0 ? totalSales / sales.length : 0,
              profitMargin: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
            },
          }
        }),
      )

      return res.json({
        success: true,
        message: "Employees with performance retrieved successfully",
        data: {
          employees: employeesWithPerformance,
          summary: {
            totalEmployees: employees.length,
            activeEmployees: employees.filter((emp) => emp.isActive).length,
            totalSales: employeesWithPerformance.reduce((sum, emp) => sum + emp.performance.totalSales, 0),
            totalProfit: employeesWithPerformance.reduce((sum, emp) => sum + emp.performance.totalProfit, 0),
          },
        },
      })
    } catch (error) {
      console.error("Get employees with performance error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch employees with performance",
      })
    }
  }
}
