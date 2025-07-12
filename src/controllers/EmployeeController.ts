// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { User } from "../database/models/User"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { MoreThan, Between, LessThanOrEqual } from "typeorm"
import { UserRole } from "../Enums/UserRole"
import { emitSaleCreated } from "../socketHandlers/salesSocketHandlers"

// Debug utility function
const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
}

// Utility functions for formatting (following your existing patterns)
const formatCurrency = (amount: number, currency: string = "RWF"): string => {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

const formatNumber = (value: number): number => {
  return Number(parseFloat(value.toString()).toFixed(2))
}


export class EmployeeController {
  // Employee login
  static async login(req: Request, res: Response) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const userRepository = dbConnection.getRepository(User)
      const { username, password } = req.body

      const user = await userRepository.findOne({
        where: { username, role: UserRole.EMPLOYEE },
      })

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        })
      }

      const isValidPassword = await bcrypt.compare(password, user.password)
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        })
      }

      // Update last login
      user.lastLoginAt = new Date()
      await userRepository.save(user)

      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" },
      )

      const { password: _, ...userWithoutPassword } = user
      return res.json({
        success: true,
        message: "Login successful",
        data: {
          user: userWithoutPassword,
          token,
        },
      })
    } catch (error) {
      console.error("Employee login error:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  }


  static async listAllProducts(req: Request, res: Response) {
    try {
      debugLog("EMPLOYEE_LIST_ALL_PRODUCTS - Request", {
        userId: req.userId,
        query: req.query,
      })

      const productRepository = dbConnection.getRepository(Product)
      const { category, inStock, search } = req.query

      // ✅ FIXED: Show ALL products, not just employee-created ones
      const queryConditions: any = {}

      if (category) {
        queryConditions.category = { id: category }
      }

      if (inStock === "true") {
        queryConditions.qtyInStock = MoreThan(0)
      }

      let products = await productRepository.find({
        where: queryConditions,
        relations: ["category", "createdBy"],
        order: { name: "ASC" },
      })

      // Apply search filter if provided
      if (search) {
        const searchTerm = search.toString().toLowerCase()
        products = products.filter(
          (product) =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.productTypeName.toLowerCase().includes(searchTerm) ||
            product.category.name.toLowerCase().includes(searchTerm) ||
            (product.sku && product.sku.toLowerCase().includes(searchTerm)),
        )
      }

      debugLog("EMPLOYEE_LIST_ALL_PRODUCTS - Result", {
        productsCount: products.length,
        userId: req.userId,
      })

      return res.status(200).json({
        success: true,
        message: "All products retrieved successfully",
        count: products.length,
        data: products,
      })
    } catch (error) {
      debugLog("EMPLOYEE_LIST_ALL_PRODUCTS - Error", error)
      console.error("Error listing products:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  }

  // ✅ FIXED: Employee can sell ANY product (not just their own)
  static async sellProduct(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      debugLog("EMPLOYEE_SELL_PRODUCT - Request", {
        body: req.body,
        userId: req.userId,
      })

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { productId, qtySold, paymentMethod, customerName, customerPhone, notes } = req.body
      const user = req.user

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        })
      }

      // Find product with creator information
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: productId },
        relations: ["createdBy"],
      })

      if (!product) {
        await queryRunner.rollbackTransaction()
        return res.status(404).json({
          success: false,
          message: "Product not found",
        })
      }

      // ✅ FIXED: Remove restriction - employees can sell ANY product
      // No need to check if product.createdBy.id === user.id

      // Check stock availability
      if (product.qtyInStock < qtySold) {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          success: false,
          message: "Insufficient stock",
          available: product.qtyInStock,
          requested: qtySold,
        })
      }

      // Generate sale number
      const saleCount = await queryRunner.manager.count(Sale)
      const saleNumber = `SALE-${String(saleCount + 1).padStart(6, "0")}`

      // Calculate sale values
      const unitPrice = product.price
      const unitCost = product.costPrice
      const totalPrice = unitPrice * qtySold
      const totalCost = unitCost * qtySold
      const profit = totalPrice - totalCost

      // Create sale record
      const sale = queryRunner.manager.create(Sale, {
        saleNumber,
        product,
        qtySold,
        unitPrice,
        unitCost,
        totalPrice,
        totalCost,
        profit,
        paymentMethod: paymentMethod || "cash",
        customerName,
        customerPhone,
        notes,
        soldBy: user,
        salesDate: new Date(),
        status: "pending",
      })

      await queryRunner.manager.save(sale)

      // Update product stock
      await queryRunner.manager.update(Product, productId, {
        qtyInStock: product.qtyInStock - qtySold,
      })

      await queryRunner.commitTransaction()

      // Fetch complete sale data
      const completeSale = await dbConnection.getRepository(Sale).findOne({
        where: { id: sale.id },
        relations: ["product", "product.category", "soldBy"],
      })

      debugLog("EMPLOYEE_SELL_PRODUCT - Success", {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        profit: sale.profit,
        soldBy: user.id,
        productCreatedBy: product.createdBy.id,
      })

      return res.status(201).json({
        success: true,
        message: "Sale recorded successfully, awaiting approval",
        data: completeSale,
      })
    } catch (error: any) {
      await queryRunner.rollbackTransaction()
      debugLog("EMPLOYEE_SELL_PRODUCT - Error", error)
      console.error("Error selling product:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    } finally {
      await queryRunner.release()
    }
  }

  static async getEmployeeDashboardOverview(req: Request, res: Response) {
    try {
      debugLog("EMPLOYEE_DASHBOARD - Request", { 
        userId: req.userId,
        socketAvailable: !!req.io,
        realTimeRequested: req.query.realTime
      });

      // Get repositories
      const saleRepository = dbConnection.getRepository(Sale);
      const productRepository = dbConnection.getRepository(Product);

      // Date calculations
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Parallel data fetching for optimal performance
      const [
        todaySales,
        yesterdaySales,
        weeklySales,
        monthlySales,
        pendingSales,
        approvedSalesCount,
        topProducts,
        inventoryStatus
      ] = await Promise.all([
        // Today's approved sales
        saleRepository.find({
          where: {
            soldBy: { id: req.userId },
            salesDate: Between(startOfDay, endOfDay),
            status: "approved",
          },
          relations: ["product"],
          order: { salesDate: "DESC" },
        }),

        // Yesterday's sales for comparison
        saleRepository.find({
          where: {
            soldBy: { id: req.userId },
            status: "approved"
          },
          relations: ["product"],
          select: {
            totalPrice: true,
            profit: true,
            qtySold: true,
            product: {
              id: true,
              name: true,
              qtyInStock: true
            }
          }
        }),

        // Weekly sales
        saleRepository.find({
          where: {
            soldBy: { id: req.userId },
            salesDate: Between(startOfWeek, endOfDay),
            status: "approved",
          },
        }),

        // Monthly sales
        saleRepository.find({
          where: {
            soldBy: { id: req.userId },
            salesDate: Between(startOfMonth, endOfDay),
            status: "approved",
          },
        }),

        // Pending sales count
        saleRepository.find({
          where: {
            soldBy: { id: req.userId },
            status: "pending",
          },
          take: 5,
          order: { createdAt: "DESC" },
          relations: ["product"], // Add product relation for enhanced display
        }),

        // Approved sales count
        saleRepository.count({
          where: {
            soldBy: { id: req.userId },
            status: "approved",
          },
        }),

        // Top 5 performing products
        saleRepository
          .createQueryBuilder("sale")
          .select([
            "product.id as productId",
            "product.name as productName",
            "SUM(sale.totalPrice) as totalSales",
            "SUM(sale.profit) as totalProfit",
            "SUM(sale.qtySold) as totalQuantity",
            "product.qtyInStock as currentStock",
          ])
          .leftJoin("sale.product", "product")
          .where("sale.soldById = :userId", { userId: req.userId })
          .andWhere("sale.status = :status", { status: "approved" })
          .groupBy("product.id, product.name, product.qtyInStock")
          .orderBy("totalSales", "DESC")
          .limit(5)
          .getRawMany(),

        // Inventory status (low stock items)
        productRepository.find({
          where: {
            qtyInStock: LessThanOrEqual(10), // Items with less than 10 in stock
          },
          order: {
            qtyInStock: "ASC",
          },
          take: 5,
        }),
      ]);

      // Calculate metrics
      const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
      const todayProfit = todaySales.reduce((sum, sale) => sum + Number(sale.profit), 0);
      const yesterdayRevenue = yesterdaySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
      const yesterdayProfit = yesterdaySales.reduce((sum, sale) => sum + Number(sale.profit), 0);
      const weeklyRevenue = weeklySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
      const monthlyRevenue = monthlySales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0);

      // Calculate comparison percentages
      const revenueChange = yesterdayRevenue > 0
        ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
        : todayRevenue > 0 ? 100 : 0;

      const profitChange = yesterdayProfit > 0
        ? ((todayProfit - yesterdayProfit) / yesterdayProfit) * 100
        : todayProfit > 0 ? 100 : 0;

      // ENHANCED: Format recent sales with Socket.io real-time indicators
      const recentSales = todaySales.slice(0, 5).map(sale => ({
        id: sale.id,
        saleNumber: sale.saleNumber,
        product: {
          id: sale.product.id,
          name: sale.product.name,
        },
        totalPrice: sale.totalPrice,
        totalPriceFormatted: formatCurrency(Number(sale.totalPrice)),
        profit: sale.profit,
        profitFormatted: formatCurrency(Number(sale.profit)),
        time: sale.salesDate,
        // ENHANCED: Real-time tracking info
        realTimeStatus: {
          canTrack: !!req.io,
          isRecent: (new Date().getTime() - new Date(sale.salesDate).getTime()) < (1000 * 60 * 30), // within 30 minutes
          socketRoom: `employee_${req.userId}_sales`
        }
      }));

      // ENHANCED: Format pending approvals with real-time status
      const pendingApprovals = pendingSales.map(sale => {
        const ageInMinutes = Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60));
        return {
          id: sale.id,
          saleNumber: sale.saleNumber,
          totalPrice: sale.totalPrice,
          totalPriceFormatted: formatCurrency(Number(sale.totalPrice)),
          productName: sale.product?.name || "Unknown Product",
          createdAt: sale.createdAt,
          // ENHANCED: Real-time status indicators
          realTimeStatus: {
            ageInMinutes,
            ageDisplay: ageInMinutes > 60 ? `${Math.floor(ageInMinutes / 60)}h ${ageInMinutes % 60}m` : `${ageInMinutes}m`,
            urgent: ageInMinutes > 120, // older than 2 hours
            canReceiveUpdates: !!req.io,
            socketNotifications: !!req.io
          }
        };
      });

      // ENHANCED: Format top products with performance indicators
      const topProductsFormatted = topProducts.map(product => ({
        id: product.productId,
        name: product.productName,
        sales: formatNumber(Number(product.totalSales)),
        salesFormatted: formatCurrency(Number(product.totalSales)),
        profit: formatNumber(Number(product.totalProfit)),
        profitFormatted: formatCurrency(Number(product.totalProfit)),
        quantity: Number(product.totalQuantity),
        stock: Number(product.currentStock),
        // ENHANCED: Performance indicators
        performance: {
          avgSaleValue: formatNumber(Number(product.totalSales) / Number(product.totalQuantity)),
          avgSaleValueFormatted: formatCurrency(Number(product.totalSales) / Number(product.totalQuantity)),
          stockStatus: Number(product.currentStock) > 10 ? "healthy" : "low",
          trending: "stable" // Could be calculated based on recent sales data
        }
      }));

      // ENHANCED: Format inventory alerts with action recommendations
      const inventoryAlerts = inventoryStatus.map(product => ({
        id: product.id,
        name: product.name,
        stock: product.qtyInStock,
        minStock: product.minStockLevel || 5,
        // ENHANCED: Action recommendations
        actions: {
          recommendRestock: product.qtyInStock <= (product.minStockLevel || 5),
          urgentRestock: product.qtyInStock <= 2,
          canSell: product.qtyInStock > 0,
          socketNotifications: !!req.io
        }
      }));

      // ENHANCED: Compile dashboard data with Socket.io capabilities
      const dashboardData = {
        summary: {
          today: {
            revenue: formatNumber(todayRevenue),
            revenueFormatted: formatCurrency(todayRevenue),
            profit: formatNumber(todayProfit),
            profitFormatted: formatCurrency(todayProfit),
            transactions: todaySales.length,
            comparison: {
              revenueChange: Math.round(revenueChange * 100) / 100,
              profitChange: Math.round(profitChange * 100) / 100,
            },
          },
          week: {
            revenue: formatNumber(weeklyRevenue),
            revenueFormatted: formatCurrency(weeklyRevenue),
            transactions: weeklySales.length,
          },
          month: {
            revenue: formatNumber(monthlyRevenue),
            revenueFormatted: formatCurrency(monthlyRevenue),
            transactions: monthlySales.length,
          },
        },
        performance: {
          approvedSales: approvedSalesCount,
          topProducts: topProductsFormatted,
        },
        alerts: {
          pendingApprovals,
          inventoryAlerts,
        },
        activity: {
          recentSales,
        },
        // ENHANCED: Real-time capabilities and Socket.io status
        realTimeCapabilities: {
          socketConnected: !!req.io,
          autoRefresh: false, // Now handled by socket events
          liveNotifications: !!req.io,
          instantUpdates: !!req.io,
          socketRoom: `employee_${req.userId}_sales`,
          features: {
            saleStatusUpdates: !!req.io,
            approvalNotifications: !!req.io,
            inventoryAlerts: !!req.io,
            performanceTracking: !!req.io
          }
        },
        // ENHANCED: Dashboard metadata
        meta: {
          userId: req.userId,
          userRole: req.user?.role,
          generatedAt: new Date().toISOString(),
          dataFreshness: "live",
          socketStatus: !!req.io ? "connected" : "disconnected",
          lastRefresh: new Date().toISOString()
        }
      };

      // ENHANCED: Socket.io Integration - Emit dashboard data update
      if (req.io && req.userId) {
        try {
          // Emit dashboard update to the specific employee's room
          req.io.to(`employee_${req.userId}_sales`).emit("dashboard_data_updated", {
            type: "employee_dashboard_overview",
            userId: req.userId,
            data: {
              summary: dashboardData.summary,
              pendingCount: pendingSales.length,
              todayMetrics: {
                revenue: todayRevenue,
                profit: todayProfit,
                transactions: todaySales.length
              },
              alerts: {
                pendingApprovals: pendingSales.length,
                lowInventory: inventoryAlerts.filter(item => item.actions.urgentRestock).length
              }
            },
            timestamp: new Date().toISOString(),
            notification: {
              title: "Dashboard Updated 📊",
              message: `Dashboard data refreshed at ${new Date().toLocaleTimeString()}`,
              priority: "info",
              autoHide: true,
              hideAfter: 3000
            }
          });

          // Log socket emission
          console.log(`🚀 Dashboard update emitted for employee ${req.userId}`);
        } catch (socketError) {
          console.error("❌ Socket dashboard notification error:", socketError);
          // Don't fail the response if socket fails
        }
      }

      debugLog("EMPLOYEE_DASHBOARD - Success", {
        todayRevenue,
        todayProfit,
        weeklyRevenue,
        monthlyRevenue,
        socketNotificationSent: !!req.io,
        pendingCount: pendingSales.length
      });

      return res.json({
        success: true,
        message: "Employee dashboard data retrieved successfully",
        timestamp: new Date().toISOString(),
        data: dashboardData,
        // ENHANCED: Include real-time status in response
        realTime: {
          enabled: !!req.io,
          socketConnected: !!req.io,
          notificationSent: !!req.io,
          subscriptionRoom: `employee_${req.userId}_sales`,
          autoUpdates: !!req.io
        }
      });

    } catch (error: any) {
      debugLog("EMPLOYEE_DASHBOARD - Error", error);
      console.error("Employee dashboard error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch employee dashboard data",
        timestamp: new Date().toISOString(),
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
        realTime: {
          enabled: !!req.io,
          errorNotificationSent: false
        }
      });
    }
  }

  // ENHANCED: View My Sales with Socket.io Integration
  static async viewMySales(req: Request, res: Response) {
    try {
      debugLog("EMPLOYEE_VIEW_MY_SALES - Request", {
        userId: req.userId,
        query: req.query,
        socketAvailable: !!req.io,
        realTimeRequested: req.query.realTime
      })

      const saleRepository = dbConnection.getRepository(Sale)
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        })
      }

      const { 
        status, 
        startDate, 
        endDate, 
        period = "all", 
        page = 1, 
        limit = 10,
        currency = "RWF",
        includeRealTimeStatus = "true"
      } = req.query
      
      const pageNum = Number.parseInt(page as string)
      const limitNum = Number.parseInt(limit as string)
      const skip = (pageNum - 1) * limitNum

      // Build query conditions
      const queryConditions: any = {
        soldBy: { id: userId },
      }

      if (status) {
        queryConditions.status = status
      }

      // Handle date filtering
      if (period === "today") {
        const today = new Date()
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
        queryConditions.salesDate = Between(startOfDay, endOfDay)
      } else if (period === "week") {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        queryConditions.salesDate = Between(weekAgo, new Date())
      } else if (period === "month") {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        queryConditions.salesDate = Between(monthAgo, new Date())
      } else if (startDate && endDate) {
        queryConditions.salesDate = Between(new Date(startDate as string), new Date(endDate as string))
      }

      // Get total count for pagination
      const total = await saleRepository.count({ where: queryConditions })

      // Find sales with pagination
      const sales = await saleRepository.find({
        where: queryConditions,
        relations: ["product", "product.category", "approvedBy"],
        order: { salesDate: "DESC" },
        skip,
        take: limitNum,
      })

      // ENHANCED: Format sales with real-time status indicators
      const enhancedSales = sales.map(sale => {
        const ageInMinutes = Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60));
        
        return {
          ...sale,
          // ENHANCED: Add formatted currency values
          totalPriceFormatted: formatCurrency(Number(sale.totalPrice), currency as string),
          profitFormatted: formatCurrency(Number(sale.profit), currency as string),
          unitPriceFormatted: formatCurrency(Number(sale.unitPrice), currency as string),
          // ENHANCED: Real-time status tracking
          realTimeStatus: includeRealTimeStatus === "true" ? {
            ageInMinutes,
            ageDisplay: ageInMinutes > 60 ? `${Math.floor(ageInMinutes / 60)}h ${ageInMinutes % 60}m` : `${ageInMinutes}m`,
            canReceiveUpdates: sale.status === "pending" && !!req.io,
            urgent: sale.status === "pending" && ageInMinutes > 120, // older than 2 hours
            socketTracking: !!req.io,
            statusColor: sale.status === "approved" ? "green" : sale.status === "pending" ? "yellow" : "red"
          } : undefined,
          // ENHANCED: Product details with stock status
          productDetails: {
            id: sale.product.id,
            name: sale.product.name,
            category: sale.product.category?.name || "Unknown",
            currentStock: sale.product.qtyInStock,
            stockStatus: sale.product.qtyInStock > 10 ? "healthy" : sale.product.qtyInStock > 0 ? "low" : "out_of_stock"
          }
        };
      });

      // Calculate daily aggregation
      const dailyAggregation = enhancedSales.reduce((acc, sale) => {
        const dateKey = sale.salesDate.toISOString().split("T")[0]
        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            totalSales: 0,
            totalSalesFormatted: "",
            totalProfit: 0,
            totalProfitFormatted: "",
            salesCount: 0,
            approvedSales: 0,
            pendingSales: 0,
            rejectedSales: 0,
          }
        }

        acc[dateKey].totalSales += Number(sale.totalPrice)
        acc[dateKey].totalProfit += Number(sale.profit)
        acc[dateKey].salesCount += 1

        // Update formatted values
        acc[dateKey].totalSalesFormatted = formatCurrency(acc[dateKey].totalSales, currency as string)
        acc[dateKey].totalProfitFormatted = formatCurrency(acc[dateKey].totalProfit, currency as string)

        if (sale.status === "approved") acc[dateKey].approvedSales += 1
        else if (sale.status === "pending") acc[dateKey].pendingSales += 1
        else if (sale.status === "rejected") acc[dateKey].rejectedSales += 1

        return acc
      }, {})

      // ENHANCED: Calculate summary with formatted values and real-time indicators
      const summary = {
        totalSales: formatNumber(sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)),
        totalSalesFormatted: formatCurrency(sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0), currency as string),
        totalProfit: formatNumber(sales.reduce((sum, sale) => sum + Number(sale.profit), 0)),
        totalProfitFormatted: formatCurrency(sales.reduce((sum, sale) => sum + Number(sale.profit), 0), currency as string),
        totalTransactions: sales.length,
        approvedSales: sales.filter((s) => s.status === "approved").length,
        pendingSales: sales.filter((s) => s.status === "pending").length,
        rejectedSales: sales.filter((s) => s.status === "rejected").length,
        // ENHANCED: Performance metrics
        avgSaleValue: formatNumber(sales.length > 0 ? sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0) / sales.length : 0),
        avgSaleValueFormatted: formatCurrency(sales.length > 0 ? sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0) / sales.length : 0, currency as string),
        conversionRate: sales.length > 0 ? ((sales.filter((s) => s.status === "approved").length / sales.length) * 100) : 0,
        // ENHANCED: Real-time status summary
        realTimeStatus: {
          pendingUpdatesAvailable: sales.filter((s) => s.status === "pending").length > 0,
          urgentPendingSales: enhancedSales.filter(sale => sale.realTimeStatus?.urgent).length,
          socketConnected: !!req.io,
          autoRefreshEnabled: !!req.io
        }
      }

      // ENHANCED: Socket.io Integration - Emit sales data update
      if (req.io && req.userId) {
        try {
          // Emit sales update to the specific employee's room
          req.io.to(`employee_${req.userId}_sales`).emit("my_sales_data_updated", {
            type: "employee_sales_view",
            userId: req.userId,
            filters: { status, period, page: pageNum, limit: limitNum },
            data: {
              salesCount: enhancedSales.length,
              totalRecords: total,
              summary: {
                totalSales: summary.totalSales,
                totalProfit: summary.totalProfit,
                pendingSales: summary.pendingSales,
                approvedSales: summary.approvedSales
              },
              alerts: {
                urgentPending: summary.realTimeStatus.urgentPendingSales,
                needsAttention: summary.realTimeStatus.pendingUpdatesAvailable
              }
            },
            timestamp: new Date().toISOString(),
            notification: {
              title: "Sales Data Updated 📈",
              message: `Your sales data has been refreshed`,
              priority: "info",
              autoHide: true,
              hideAfter: 2000
            }
          });

          // If there are urgent pending sales, send special notification
          if (summary.realTimeStatus.urgentPendingSales > 0) {
            req.io.to(`employee_${req.userId}_sales`).emit("urgent_pending_alert", {
              count: summary.realTimeStatus.urgentPendingSales,
              message: `You have ${summary.realTimeStatus.urgentPendingSales} sales pending for more than 2 hours`,
              priority: "warning",
              autoHide: false
            });
          }

          console.log(`🚀 Sales data update emitted for employee ${req.userId}`);
        } catch (socketError) {
          console.error("❌ Socket sales notification error:", socketError);
          // Don't fail the response if socket fails
        }
      }

      debugLog("EMPLOYEE_VIEW_MY_SALES - Result", {
        salesCount: enhancedSales.length,
        totalProfit: summary.totalProfit,
        dailyAggregationDays: Object.keys(dailyAggregation).length,
        socketNotificationSent: !!req.io,
        urgentPendingSales: summary.realTimeStatus.urgentPendingSales
      })

      return res.status(200).json({
        success: true,
        message: "Your sales retrieved successfully",
        timestamp: new Date().toISOString(),
        data: {
          sales: enhancedSales,
          dailyAggregation: Object.values(dailyAggregation),
          summary,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1,
            limit: limitNum
          },
        },
        // ENHANCED: Real-time integration status
        realTime: {
          enabled: !!req.io,
          socketConnected: !!req.io,
          notificationSent: !!req.io,
          subscriptionRoom: `employee_${req.userId}_sales`,
          features: {
            liveUpdates: !!req.io,
            approvalNotifications: !!req.io,
            urgentAlerts: !!req.io,
            autoRefresh: false // Handled by sockets now
          },
          lastDataRefresh: new Date().toISOString()
        }
      })
    } catch (error) {
      debugLog("EMPLOYEE_VIEW_MY_SALES - Error", error)
      console.error("Error viewing employee sales:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        timestamp: new Date().toISOString(),
        realTime: {
          enabled: !!req.io,
          errorNotificationSent: false
        },
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      })
    }
  }

  // Get employee's daily sales summary
  static async getDailySalesSummary(req: Request, res: Response) {
    try {
      const { date, period = "today" } = req.query
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        })
      }

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

      const sales = await saleRepository.find({
        where: {
          soldBy: { id: userId },
          salesDate: Between(startDate, endDate),
          status: "approved",
        },
        relations: ["product"],
      })

      const summary = {
        period,
        dateRange: { start: startDate, end: endDate },
        totalSales: sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0),
        totalProfit: sales.reduce((sum, sale) => sum + Number(sale.profit), 0),
        totalTransactions: sales.length,
        avgSaleValue:
          sales.length > 0 ? sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0) / sales.length : 0,
        profitMargin:
          sales.length > 0
            ? (sales.reduce((sum, sale) => sum + Number(sale.profit), 0) /
                sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)) *
              100
            : 0,
      }

      return res.json({
        success: true,
        message: "Daily sales summary retrieved successfully",
        data: summary,
      })
    } catch (error) {
      console.error("Employee daily sales summary error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch daily sales summary",
      })
    }
  }

  // Get employee's product performance (for products they can sell)
  static async getProductPerformance(req: Request, res: Response) {
    try {
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        })
      }

      const productRepository = dbConnection.getRepository(Product)
      const saleRepository = dbConnection.getRepository(Sale)

      // ✅ FIXED: Get ALL products (not just employee-created ones)
      const products = await productRepository.find({
        relations: ["category", "createdBy"],
      })

      // Get performance data for products this employee has sold
      const productPerformance = await Promise.all(
        products.map(async (product) => {
          const sales = await saleRepository.find({
            where: {
              product: { id: product.id },
              soldBy: { id: userId },
              status: "approved",
            },
          })

          const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
          const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)
          const totalQuantitySold = sales.reduce((sum, sale) => sum + Number(sale.qtySold), 0)

          return {
            productId: product.id,
            productName: product.name,
            categoryName: product.category.name,
            createdBy: `${product.createdBy.firstName} ${product.createdBy.lastName}`,
            currentStock: product.qtyInStock,
            currentPrice: product.price,
            costPrice: product.costPrice,
            salesCount: sales.length,
            totalQuantitySold,
            totalSales,
            totalProfit,
            profitMargin: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
            avgSaleValue: sales.length > 0 ? totalSales / sales.length : 0,
          }
        }),
      )

      // Filter out products with no sales by this employee and sort by total profit
      const filteredPerformance = productPerformance
        .filter((product) => product.salesCount > 0)
        .sort((a, b) => b.totalProfit - a.totalProfit)

      const summary = {
        totalProductsSold: filteredPerformance.length,
        totalSales: filteredPerformance.reduce((sum, p) => sum + p.totalSales, 0),
        totalProfit: filteredPerformance.reduce((sum, p) => sum + p.totalProfit, 0),
        totalTransactions: filteredPerformance.reduce((sum, p) => sum + p.salesCount, 0),
        bestPerformingProduct: filteredPerformance[0] || null,
      }

      return res.json({
        success: true,
        message: "Product performance retrieved successfully",
        data: {
          products: filteredPerformance,
          summary,
        },
      })
    } catch (error) {
      console.error("Employee product performance error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch product performance",
      })
    }
  }
}
