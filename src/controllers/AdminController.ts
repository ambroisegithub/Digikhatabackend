// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { User } from "../database/models/User"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { StockMovement } from "../database/models/StockMovement"
import { Between, LessThanOrEqual } from "typeorm"
import { UserRole } from "../Enums/UserRole"
import { subDays } from "date-fns"

const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
}

export class AdminController {
  // KEEPING EXISTING: getDashboardOverview with real-time enhancement
  static async getDashboardOverview(req: Request, res: Response) {
    try {
      debugLog("ADMIN_DASHBOARD - Request", { userId: req.userId })

      const userRepository = dbConnection.getRepository(User)
      const productRepository = dbConnection.getRepository(Product)
      const saleRepository = dbConnection.getRepository(Sale)

      // Get date ranges (keeping existing logic)
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

      // Parallel data fetching for better performance (keeping existing logic)
      const [
        employees,
        totalProducts,
        lowStockProducts,
        criticalStockProducts,
        todaySales,
        yesterdaySales,
        weeklySales,
        monthlySales,
        pendingSalesCount
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

      // Calculate today's metrics (keeping existing logic)
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
          count: pendingSalesCount,
          // ENHANCED: Real-time capability indicator
          realTime: !!req.io,
          urgent: pendingSalesCount > 10
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

      // ENHANCED: Dashboard response structure with real-time capabilities
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
        
        // ENHANCED: Real-time capabilities
        realTimeCapabilities: {
          socketConnected: !!req.io,
          pendingSalesRealTime: !!req.io && pendingSalesCount > 0,
          notificationsEnabled: !!req.io,
          autoRefreshRecommended: false, // Now handled by sockets
          lastUpdated: new Date().toISOString()
        },

        // ENHANCED: Notification summary
        notifications: {
          pending: pendingSalesCount,
          critical: criticalStockProducts.length,
          urgent: pendingSalesCount > 5 || criticalStockProducts.length > 3,
          realTimeEnabled: !!req.io
        },
        
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
        criticalStockCount: criticalStockProducts.length,
        socketConnected: !!req.io
      })

      return res.json({
        success: true,
        message: "Dashboard data retrieved successfully",
        data: enhancedDashboardData,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      debugLog("ADMIN_DASHBOARD - Error", error)
      console.error("Admin dashboard error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard data",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    }
  }

  // KEEPING EXISTING: Daily sales aggregation (no changes needed)
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

  // KEEPING EXISTING: Profit analysis (no changes needed)
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

  // ENHANCED: Approve sale with real-time socket notifications
  static async approveSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { saleId } = req.params
      const { notes } = req.body
      const adminUser = req.user

      if (!adminUser || adminUser.role !== UserRole.ADMIN) {
        await queryRunner.rollbackTransaction()
        return res.status(403).json({
          success: false,
          message: "Only admins can approve sales",
        })
      }

      // Find sale with complete relations
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: Number(saleId) },
        relations: ["product", "product.category", "soldBy"],
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
          message: `Sale is ${sale.status}, not pending approval`,
        })
      }

      // Update sale status
      sale.status = "approved"
      sale.approvedBy = adminUser
      sale.approvedAt = new Date()
      if (notes) {
        sale.notes = notes
      }

      const updatedSale = await queryRunner.manager.save(sale)

      // Update product statistics
      await queryRunner.manager.update(Product, sale.product.id, {
        totalSales: () => `totalSales + ${sale.totalPrice}`,
        totalProfit: () => `totalProfit + ${sale.profit}`,
        lastSaleDate: new Date()
      })

      await queryRunner.commitTransaction()

      // ENHANCED SOCKET INTEGRATION: Emit comprehensive real-time notifications
      if (req.io) {
        try {
          // Prepare rich notification data
          const notificationData = {
            type: "approved",
            sale: {
              id: updatedSale.id,
              saleNumber: updatedSale.saleNumber,
              status: updatedSale.status,
              totalPrice: Number(updatedSale.totalPrice),
              profit: Number(updatedSale.profit),
              product: {
                id: sale.product.id,
                name: sale.product.name,
                category: sale.product.category.name,
              },
              soldBy: {
                id: sale.soldBy.id,
                firstName: sale.soldBy.firstName,
                lastName: sale.soldBy.lastName,
              },
              approvedBy: {
                id: adminUser.id,
                firstName: adminUser.firstName,
                lastName: adminUser.lastName,
              },
              approvedAt: updatedSale.approvedAt,
              notes: updatedSale.notes
            },
            notification: {
              title: "Sale Approved! 🎉",
              message: `Your sale #${updatedSale.saleNumber} for ${sale.product.name} has been approved by ${adminUser.firstName}`,
              amount: Number(updatedSale.totalPrice),
              profit: Number(updatedSale.profit),
              priority: "success",
              autoHide: false,
              actions: ["view_details"]
            },
            timestamp: new Date().toISOString(),
          }

          // Notify the employee who made the sale
          req.io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_status_updated", notificationData)

          // Notify all admins to update their pending list
          req.io.to("admin_sales_room").emit("sale_approved_broadcast", {
            saleId: updatedSale.id,
            saleNumber: updatedSale.saleNumber,
            approvedBy: `${adminUser.firstName} ${adminUser.lastName}`,
            amount: Number(updatedSale.totalPrice),
            employeeName: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
            productName: sale.product.name,
            timestamp: new Date().toISOString(),
          })

          // Update pending count for all admins
          const newPendingCount = await dbConnection.getRepository(Sale).count({
            where: { status: "pending" }
          })
          
          req.io.to("admin_sales_room").emit("pending_count_updated", {
            count: newPendingCount,
            action: "approved",
            saleNumber: updatedSale.saleNumber,
            difference: -1
          })

          console.log(`🚀 Real-time notifications sent for approved sale #${updatedSale.saleNumber}`)

        } catch (socketError) {
          console.error("❌ Socket notification error:", socketError)
          // Don't fail the response if socket fails
        }
      }

      return res.json({
        success: true,
        message: "Sale approved successfully",
        data: {
          ...updatedSale,
          // Add formatted values for frontend
          totalPriceFormatted: `${Number(updatedSale.totalPrice).toLocaleString()} RWF`,
          profitFormatted: `${Number(updatedSale.profit).toLocaleString()} RWF`,
        },
        realTimeNotification: {
          sent: !!req.io,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Approve sale error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to approve sale",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    } finally {
      await queryRunner.release()
    }
  }

  // ENHANCED: Reject sale with real-time socket notifications
  static async rejectSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { saleId } = req.params
      const { reason } = req.body
      const adminUser = req.user

      if (!adminUser || adminUser.role !== UserRole.ADMIN) {
        await queryRunner.rollbackTransaction()
        return res.status(403).json({
          success: false,
          message: "Only admins can reject sales",
        })
      }

      if (!reason || reason.trim().length === 0) {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required",
        })
      }

      // Find sale with complete relations
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: Number(saleId) },
        relations: ["product", "product.category", "soldBy"],
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
          message: `Sale is ${sale.status}, not pending approval`,
        })
      }

      // Update sale status
      sale.status = "rejected"
      sale.approvedBy = adminUser
      sale.approvedAt = new Date()
      sale.notes = reason

      await queryRunner.manager.save(sale)

      // Restore product stock
      await queryRunner.manager.update(Product, sale.product.id, {
        qtyInStock: () => `qtyInStock + ${sale.qtySold}`,
      })

      // Create stock movement record
      const stockMovement = queryRunner.manager.create(StockMovement, {
        product: sale.product,
        type: "in",
        quantity: sale.qtySold,
        reason: `Sale ${sale.saleNumber} rejection - Stock restored`,
        notes: `Rejected by ${adminUser.firstName} ${adminUser.lastName}: ${reason}`,
        recordedBy: adminUser,
        movementDate: new Date(),
      })

      await queryRunner.manager.save(stockMovement)
      await queryRunner.commitTransaction()

      // ENHANCED SOCKET INTEGRATION: Emit comprehensive rejection notifications
      if (req.io) {
        try {
          // Prepare rich notification data
          const notificationData = {
            type: "rejected",
            sale: {
              id: sale.id,
              saleNumber: sale.saleNumber,
              status: sale.status,
              totalPrice: Number(sale.totalPrice),
              profit: Number(sale.profit),
              product: {
                id: sale.product.id,
                name: sale.product.name,
                category: sale.product.category.name,
              },
              soldBy: {
                id: sale.soldBy.id,
                firstName: sale.soldBy.firstName,
                lastName: sale.soldBy.lastName,
              },
              rejectedBy: {
                id: adminUser.id,
                firstName: adminUser.firstName,
                lastName: adminUser.lastName,
              },
              rejectedAt: sale.approvedAt,
              rejectionReason: sale.notes,
              stockRestored: sale.qtySold
            },
            notification: {
              title: "Sale Rejected ❌",
              message: `Your sale #${sale.saleNumber} for ${sale.product.name} was rejected`,
              reason: reason,
              stockRestored: sale.qtySold,
              priority: "warning",
              autoHide: false,
              actions: ["view_reason", "create_new_sale"]
            },
            timestamp: new Date().toISOString(),
          }

          // Notify the employee who made the sale
          req.io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_status_updated", notificationData)

          // Notify all admins
          req.io.to("admin_sales_room").emit("sale_rejected_broadcast", {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            rejectedBy: `${adminUser.firstName} ${adminUser.lastName}`,
            reason: reason,
            amount: Number(sale.totalPrice),
            employeeName: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
            productName: sale.product.name,
            stockRestored: sale.qtySold,
            timestamp: new Date().toISOString(),
          })

          // Update pending count for all admins
          const newPendingCount = await dbConnection.getRepository(Sale).count({
            where: { status: "pending" }
          })
          
          req.io.to("admin_sales_room").emit("pending_count_updated", {
            count: newPendingCount,
            action: "rejected",
            saleNumber: sale.saleNumber,
            difference: -1
          })

          console.log(`🚀 Real-time notifications sent for rejected sale #${sale.saleNumber}`)

        } catch (socketError) {
          console.error("❌ Socket notification error:", socketError)
          // Don't fail the response if socket fails
        }
      }

      return res.json({
        success: true,
        message: "Sale rejected successfully and stock restored",
        data: {
          ...sale,
          // Add formatted values for frontend
          totalPriceFormatted: `${Number(sale.totalPrice).toLocaleString()} RWF`,
          profitFormatted: `${Number(sale.profit).toLocaleString()} RWF`,
          stockRestored: sale.qtySold,
        },
        realTimeNotification: {
          sent: !!req.io,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Reject sale error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to reject sale",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    } finally {
      await queryRunner.release()
    }
  }

  // KEEPING EXISTING: Get all employees with performance (no changes needed)
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

  // NEW: Get real-time pending sales with enhanced data
  static async getPendingSalesRealTime(req: Request, res: Response) {
    try {
      if (req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "Only admins can access pending sales",
        })
      }

      const { limit = 50, sortBy = "createdAt", sortOrder = "DESC" } = req.query
      const saleRepository = dbConnection.getRepository(Sale)

      const pendingSales = await saleRepository.find({
        where: { status: "pending" },
        relations: ["product", "product.category", "soldBy"],
        order: { [sortBy as string]: sortOrder as "ASC" | "DESC" },
        take: Number(limit)
      })

      // Enhanced pending sales with real-time indicators
      const enhancedPendingSales = pendingSales.map(sale => {
        const ageInMinutes = Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60))
        const ageInHours = Math.floor(ageInMinutes / 60)
        
        return {
          ...sale,
          // Add formatted values
          totalPriceFormatted: `${Number(sale.totalPrice).toLocaleString()} RWF`,
          profitFormatted: `${Number(sale.profit).toLocaleString()} RWF`,
          unitPriceFormatted: `${Number(sale.unitPrice).toLocaleString()} RWF`,
          
          // Age calculations
          ageInMinutes,
          ageInHours,
          ageDisplay: ageInHours > 0 ? `${ageInHours}h ${ageInMinutes % 60}m` : `${ageInMinutes}m`,
          
          // Priority indicators
          urgent: ageInHours >= 2,
          critical: ageInHours >= 4,
          priority: ageInHours >= 4 ? "critical" : ageInHours >= 2 ? "urgent" : "normal",
          
          // Real-time actions
          realTimeActions: {
            canApprove: true,
            canReject: true,
            canBulkProcess: true,
            socketAvailable: !!req.io
          },
          
          // Employee info
          employee: {
            id: sale.soldBy.id,
            name: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
            firstName: sale.soldBy.firstName,
            lastName: sale.soldBy.lastName
          },
          
          // Product info
          productInfo: {
            id: sale.product.id,
            name: sale.product.name,
            category: sale.product.category?.name || "Unknown",
            currentStock: sale.product.qtyInStock
          }
        }
      })

      // Calculate summary statistics
      const totalValue = pendingSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfit = pendingSales.reduce((sum, sale) => sum + Number(sale.profit), 0)
      const urgentCount = enhancedPendingSales.filter(sale => sale.urgent).length
      const criticalCount = enhancedPendingSales.filter(sale => sale.critical).length
      
      // Group by employee
      const employeeGroups = enhancedPendingSales.reduce((acc, sale) => {
        const employeeId = sale.employee.id
        if (!acc[employeeId]) {
          acc[employeeId] = {
            employeeId,
            employeeName: sale.employee.name,
            sales: [],
            totalValue: 0,
            count: 0
          }
        }
        acc[employeeId].sales.push(sale)
        acc[employeeId].totalValue += Number(sale.totalPrice)
        acc[employeeId].count += 1
        return acc
      }, {})

      const summary = {
        totalPending: pendingSales.length,
        totalValue,
        totalValueFormatted: `${totalValue.toLocaleString()} RWF`,
        totalProfit,
        totalProfitFormatted: `${totalProfit.toLocaleString()} RWF`,
        urgentCount,
        criticalCount,
        normalCount: pendingSales.length - urgentCount,
        averageValue: pendingSales.length > 0 ? totalValue / pendingSales.length : 0,
        averageAge: pendingSales.length > 0 ? 
          enhancedPendingSales.reduce((sum, sale) => sum + sale.ageInMinutes, 0) / pendingSales.length : 0,
        employeeCount: Object.keys(employeeGroups).length,
        socketConnected: !!req.io,
        realTimeEnabled: true,
        lastUpdated: new Date().toISOString()
      }

      return res.json({
        success: true,
        message: "Pending sales retrieved successfully",
        timestamp: new Date().toISOString(),
        data: {
          pendingSales: enhancedPendingSales,
          summary,
          employeeGroups: Object.values(employeeGroups),
          realTimeCapabilities: {
            autoRefresh: false, // Now handled by sockets
            socketNotifications: !!req.io,
            bulkActions: true,
            individualActions: true
          },
          filters: {
            applied: { sortBy, sortOrder, limit },
            available: {
              sortBy: ["createdAt", "totalPrice", "profit", "qtySold"],
              sortOrder: ["ASC", "DESC"]
            }
          }
        }
      })
    } catch (error) {
      console.error("Get pending sales real-time error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch pending sales",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    }
  }

  // NEW: Bulk approve sales
  static async bulkApproveSales(req: Request, res: Response) {
    try {
      if (req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "Only admins can bulk approve sales",
        })
      }

      const { saleIds, notes } = req.body
      const adminUser = req.user

      if (!Array.isArray(saleIds) || saleIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Sale IDs array is required",
        })
      }

      const saleRepository = dbConnection.getRepository(Sale)
      const results = []
      let successCount = 0
      let failureCount = 0

      // Process each sale
      for (const saleId of saleIds) {
        const queryRunner = dbConnection.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
          const sale = await queryRunner.manager.findOne(Sale, {
            where: { id: Number(saleId) },
            relations: ["product", "product.category", "soldBy"],
          })

          if (!sale) {
            await queryRunner.rollbackTransaction()
            results.push({ saleId, success: false, error: "Sale not found" })
            failureCount++
            continue
          }

          if (sale.status !== "pending") {
            await queryRunner.rollbackTransaction()
            results.push({ saleId, success: false, error: `Sale is ${sale.status}` })
            failureCount++
            continue
          }

          // Update sale
          sale.status = "approved"
          sale.approvedBy = adminUser
          sale.approvedAt = new Date()
          if (notes) sale.notes = notes

          const updatedSale = await queryRunner.manager.save(sale)

          // Update product statistics
          await queryRunner.manager.update(Product, sale.product.id, {
            totalSales: () => `totalSales + ${sale.totalPrice}`,
            totalProfit: () => `totalProfit + ${sale.profit}`,
            lastSaleDate: new Date()
          })

          await queryRunner.commitTransaction()

          // Send individual notifications via socket
          if (req.io) {
            req.io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_status_updated", {
              type: "approved",
              sale: {
                id: updatedSale.id,
                saleNumber: updatedSale.saleNumber,
                status: updatedSale.status,
                totalPrice: Number(updatedSale.totalPrice),
                profit: Number(updatedSale.profit),
                product: {
                  name: sale.product.name,
                  category: sale.product.category.name,
                },
                approvedBy: {
                  id: adminUser.id,
                  firstName: adminUser.firstName,
                  lastName: adminUser.lastName,
                },
                approvedAt: updatedSale.approvedAt,
              },
              notification: {
                title: "Sale Approved! 🎉",
                message: `Your sale #${updatedSale.saleNumber} was approved (bulk approval)`,
                priority: "success",
                autoHide: true,
                hideAfter: 5000
              },
              timestamp: new Date().toISOString(),
            })
          }

          results.push({ saleId, success: true, data: updatedSale })
          successCount++

        } catch (error) {
          await queryRunner.rollbackTransaction()
          results.push({ saleId, success: false, error: error.message })
          failureCount++
        } finally {
          await queryRunner.release()
        }
      }

      // Send bulk notification to all admins
      if (req.io) {
        const newPendingCount = await saleRepository.count({ where: { status: "pending" } })
        
        req.io.to("admin_sales_room").emit("bulk_approval_completed", {
          totalProcessed: saleIds.length,
          successCount,
          failureCount,
          approvedBy: `${adminUser.firstName} ${adminUser.lastName}`,
          newPendingCount,
          timestamp: new Date().toISOString(),
        })

        req.io.to("admin_sales_room").emit("pending_count_updated", {
          count: newPendingCount,
          action: "bulk_approved",
          difference: -successCount
        })
      }

      return res.json({
        success: true,
        message: `Bulk approval completed: ${successCount} approved, ${failureCount} failed`,
        data: {
          results,
          summary: {
            totalProcessed: saleIds.length,
            successCount,
            failureCount,
            successRate: (successCount / saleIds.length) * 100
          }
        },
        realTimeNotification: {
          sent: !!req.io,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error("Bulk approve sales error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to bulk approve sales",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    }
  }

  // NEW: Get real-time dashboard stats
  static async getRealTimeDashboardStats(req: Request, res: Response) {
    try {
      if (req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "Only admins can access dashboard stats",
        })
      }

      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)
      const userRepository = dbConnection.getRepository(User)

      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      // Get real-time metrics
      const [
        pendingCount,
        todayApproved,
        todayRevenue,
        criticalStock,
        activeEmployees,
        recentActivity
      ] = await Promise.all([
        saleRepository.count({ where: { status: "pending" } }),
        
        saleRepository.count({ 
          where: { 
            status: "approved",
            salesDate: Between(startOfDay, new Date())
          } 
        }),
        
        saleRepository
          .createQueryBuilder("sale")
          .select("SUM(sale.totalPrice)", "total")
          .where("sale.status = :status", { status: "approved" })
          .andWhere("sale.salesDate >= :startDate", { startDate: startOfDay })
          .getRawOne(),
          
        productRepository.count({
          where: { qtyInStock: LessThanOrEqual(5) }
        }),
        
        userRepository.count({
          where: { role: UserRole.EMPLOYEE, isActive: true }
        }),
        
        saleRepository.find({
          where: { status: "pending" },
          order: { createdAt: "DESC" },
          take: 5,
          relations: ["soldBy", "product"]
        })
      ])

      const stats = {
        pending: {
          sales: pendingCount,
          urgent: recentActivity.filter(sale => 
            Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60 * 60)) >= 2
          ).length
        },
        today: {
          approved: todayApproved,
          revenue: parseFloat(todayRevenue?.total || 0),
          revenueFormatted: `${parseFloat(todayRevenue?.total || 0).toLocaleString()} RWF`
        },
        inventory: {
          criticalStock
        },
        employees: {
          active: activeEmployees
        },
        recentActivity: recentActivity.map(sale => ({
          id: sale.id,
          saleNumber: sale.saleNumber,
          employeeName: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
          productName: sale.product.name,
          amount: Number(sale.totalPrice),
          age: Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60))
        })),
        realTime: {
          socketConnected: !!req.io,
          lastUpdated: new Date().toISOString(),
          autoRefresh: false // Handled by sockets
        }
      }

      return res.json({
        success: true,
        message: "Real-time dashboard stats retrieved successfully",
        data: stats,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error("Get real-time dashboard stats error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard stats",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    }
  }
}