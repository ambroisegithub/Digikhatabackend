// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { User } from "../database/models/User"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { MoreThan, Between } from "typeorm"
import { UserRole } from "../Enums/UserRole"

// Debug utility function
const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
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

  // ✅ FIXED: List ALL products (not just employee-created ones)
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

  // ✅ Fix 2: Employee sales with daily aggregation
  static async viewMySales(req: Request, res: Response) {
    try {
      debugLog("EMPLOYEE_VIEW_MY_SALES - Request", {
        userId: req.userId,
        query: req.query,
      })

      const saleRepository = dbConnection.getRepository(Sale)
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        })
      }

      const { status, startDate, endDate, period = "all", page = 1, limit = 10 } = req.query
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

      // Calculate daily aggregation
      const dailyAggregation = sales.reduce((acc, sale) => {
        const dateKey = sale.salesDate.toISOString().split("T")[0]
        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            totalSales: 0,
            totalProfit: 0,
            salesCount: 0,
            approvedSales: 0,
            pendingSales: 0,
            rejectedSales: 0,
          }
        }

        acc[dateKey].totalSales += Number(sale.totalPrice)
        acc[dateKey].totalProfit += Number(sale.profit)
        acc[dateKey].salesCount += 1

        if (sale.status === "approved") acc[dateKey].approvedSales += 1
        else if (sale.status === "pending") acc[dateKey].pendingSales += 1
        else if (sale.status === "rejected") acc[dateKey].rejectedSales += 1

        return acc
      }, {})

      // Calculate summary
      const summary = {
        totalSales: sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0),
        totalProfit: sales.reduce((sum, sale) => sum + Number(sale.profit), 0),
        totalTransactions: sales.length,
        approvedSales: sales.filter((s) => s.status === "approved").length,
        pendingSales: sales.filter((s) => s.status === "pending").length,
        rejectedSales: sales.filter((s) => s.status === "rejected").length,
      }

      debugLog("EMPLOYEE_VIEW_MY_SALES - Result", {
        salesCount: sales.length,
        totalProfit: summary.totalProfit,
        dailyAggregationDays: Object.keys(dailyAggregation).length,
      })

      return res.status(200).json({
        success: true,
        message: "Your sales retrieved successfully",
        data: {
          sales,
          dailyAggregation: Object.values(dailyAggregation),
          summary,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1,
          },
        },
      })
    } catch (error) {
      debugLog("EMPLOYEE_VIEW_MY_SALES - Error", error)
      console.error("Error viewing employee sales:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
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
