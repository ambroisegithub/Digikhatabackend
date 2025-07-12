// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Sale } from "../database/models/Sale"
import { Product } from "../database/models/Product"
import { StockMovement } from "../database/models/StockMovement"
import { UserRole } from "../Enums/UserRole"

// Utility functions for formatting
const formatCurrency = (amount: number, currency: string = "RWF"): string => {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`
}

const formatNumber = (value: number): number => {
  return Number(parseFloat(value.toString()).toFixed(2))
}

// Debug utility function
const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
}

export class EnhancedSaleController {
  static async createSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      debugLog("CREATE_SALE - Request", {
        body: req.body,
        userId: req.userId,
        userRole: req.user?.role,
      })

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { productId, qtySold, paymentMethod, customerName, customerPhone, notes, employeeNotes } = req.body
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
        employeeNotes,
        soldBy: user,
        salesDate: new Date(),
        status: "pending",
      })

      await queryRunner.manager.save(sale)

      await queryRunner.manager.update(Product, productId, {
        qtyInStock: product.qtyInStock - qtySold,
      })

      const stockMovement = queryRunner.manager.create(StockMovement, {
        product,
        type: "out",
        quantity: qtySold,
        reason: `Sale ${saleNumber} - Pending approval`,
        notes: `Sale to ${customerName || "Customer"}`,
        recordedBy: user,
        movementDate: new Date(),
      })

      await queryRunner.manager.save(stockMovement)
      await queryRunner.commitTransaction()

      // Fetch the complete sale data for response
      const completeSale = await dbConnection.getRepository(Sale).findOne({
        where: { id: sale.id },
        relations: ["product", "product.category", "soldBy"],
      })

      debugLog("CREATE_SALE - Success", {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        profit: sale.profit,
        soldBy: user.id,
        productCreatedBy: product.createdBy.id,
      })

      return res.status(201).json({
        success: true,
        message: "Sale created successfully, awaiting approval",
        data: completeSale,
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      debugLog("CREATE_SALE - Error", error)
      console.error("Create sale error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to create sale",
      })
    } finally {
      await queryRunner.release()
    }
  }

  // ✅ Enhanced: Get sales with improved response format
  static async getSales(req: Request, res: Response) {
    try {
      debugLog("GET_SALES - Request", {
        query: req.query,
        userId: req.userId,
        userRole: req.user?.role,
      })

      const { 
        page = 1, 
        limit = 10, 
        status, 
        startDate, 
        endDate, 
        paymentMethod, 
        productId, 
        employeeId,
        currency = "RWF"
      } = req.query
      
      const pageNum = Number.parseInt(page as string)
      const limitNum = Number.parseInt(limit as string)
      const skip = (pageNum - 1) * limitNum

      const saleRepository = dbConnection.getRepository(Sale)
      const queryBuilder = saleRepository
        .createQueryBuilder("sale")
        .leftJoinAndSelect("sale.product", "product")
        .leftJoinAndSelect("product.category", "category")
        .leftJoinAndSelect("sale.soldBy", "soldBy")
        .leftJoinAndSelect("sale.approvedBy", "approvedBy")

      if (req.user?.role === UserRole.EMPLOYEE) {
        queryBuilder.andWhere("sale.soldBy.id = :userId", { userId: req.userId })
      } else if (employeeId && req.user?.role === UserRole.ADMIN) {
        queryBuilder.andWhere("sale.soldBy.id = :employeeId", { employeeId })
      }

      // Apply other filters
      if (status) {
        queryBuilder.andWhere("sale.status = :status", { status })
      }

      if (startDate) {
        queryBuilder.andWhere("sale.salesDate >= :startDate", { startDate: new Date(startDate as string) })
      }

      if (endDate) {
        queryBuilder.andWhere("sale.salesDate <= :endDate", { endDate: new Date(endDate as string) })
      }

      if (paymentMethod) {
        queryBuilder.andWhere("sale.paymentMethod = :paymentMethod", { paymentMethod })
      }

      if (productId) {
        queryBuilder.andWhere("sale.product.id = :productId", { productId })
      }

      // Get total count for pagination
      const total = await queryBuilder.getCount()

      // Get paginated results
      const sales = await queryBuilder.orderBy("sale.createdAt", "DESC").skip(skip).take(limitNum).getMany()

      // Enhanced sales data with formatted values
      const enhancedSales = sales.map(sale => ({
        ...sale,
        // Add formatted values
        totalPriceFormatted: formatCurrency(Number(sale.totalPrice), currency as string),
        profitFormatted: formatCurrency(Number(sale.profit), currency as string),
        unitPriceFormatted: formatCurrency(Number(sale.unitPrice), currency as string),
        // Clean up sensitive data
        soldBy: {
          id: sale.soldBy.id,
          username: sale.soldBy.username,
          firstName: sale.soldBy.firstName,
          lastName: sale.soldBy.lastName,
          role: sale.soldBy.role
        },
        approvedBy: sale.approvedBy ? {
          id: sale.approvedBy.id,
          username: sale.approvedBy.username,
          firstName: sale.approvedBy.firstName,
          lastName: sale.approvedBy.lastName,
          role: sale.approvedBy.role
        } : null
      }))

      // Calculate enhanced summary
      const totalSalesAmount = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfitAmount = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)
      const approvedSales = sales.filter((s) => s.status === "approved")
      const pendingSales = sales.filter((s) => s.status === "pending")
      const rejectedSales = sales.filter((s) => s.status === "rejected")

      const enhancedSummary = {
        currency: currency as string,
        totalSales: formatNumber(totalSalesAmount),
        totalSalesFormatted: formatCurrency(totalSalesAmount, currency as string),
        totalProfit: formatNumber(totalProfitAmount),
        totalProfitFormatted: formatCurrency(totalProfitAmount, currency as string),
        totalTransactions: sales.length,
        avgTransactionValue: formatNumber(sales.length > 0 ? totalSalesAmount / sales.length : 0),
        avgTransactionValueFormatted: formatCurrency(sales.length > 0 ? totalSalesAmount / sales.length : 0, currency as string),
        profitMargin: formatNumber(totalSalesAmount > 0 ? (totalProfitAmount / totalSalesAmount) * 100 : 0),
        profitMarginFormatted: formatPercentage(totalSalesAmount > 0 ? (totalProfitAmount / totalSalesAmount) * 100 : 0),
        approvedSales: approvedSales.length,
        pendingSales: pendingSales.length,
        rejectedSales: rejectedSales.length,
        statusBreakdown: {
          approved: {
            count: approvedSales.length,
            totalValue: formatNumber(approvedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)),
            totalValueFormatted: formatCurrency(approvedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0), currency as string)
          },
          pending: {
            count: pendingSales.length,
            totalValue: formatNumber(pendingSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)),
            totalValueFormatted: formatCurrency(pendingSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0), currency as string)
          },
          rejected: {
            count: rejectedSales.length,
            totalValue: formatNumber(rejectedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)),
            totalValueFormatted: formatCurrency(rejectedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0), currency as string)
          }
        }
      }

      debugLog("GET_SALES - Result", {
        salesCount: sales.length,
        totalRecords: total,
        userRole: req.user?.role,
      })

      return res.json({
        success: true,
        message: "Sales retrieved successfully",
        timestamp: new Date().toISOString(),
        data: {
          sales: enhancedSales,
          summary: enhancedSummary,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1,
            limit: limitNum
          },
        },
      })
    } catch (error) {
      debugLog("GET_SALES - Error", error)
      console.error("Get sales error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch sales",
        timestamp: new Date().toISOString()
      })
    }
  }

  // ✅ Enhanced: Get sales summary with comprehensive formatting and transaction details
  static async getSalesSummary(req: Request, res: Response) {
    try {
      const { period = "today", employeeId, currency = "RWF", includeTransactionDetails = "true" } = req.query
      const now = new Date()
      let startDate: Date
      let endDate: Date = new Date()

      switch (period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
          break
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1)
          break
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      }

      const saleRepository = dbConnection.getRepository(Sale)
      
      // Base query builder for filtering
      const baseQuery = saleRepository
        .createQueryBuilder("sale")
        .where("sale.salesDate >= :startDate", { startDate })
        .andWhere("sale.salesDate <= :endDate", { endDate })
        .andWhere("sale.status = :status", { status: "approved" })

      // Role-based filtering
      if (req.user?.role === UserRole.EMPLOYEE) {
        baseQuery.andWhere("sale.soldBy.id = :userId", { userId: req.userId })
      } else if (employeeId && req.user?.role === UserRole.ADMIN) {
        baseQuery.andWhere("sale.soldBy.id = :employeeId", { employeeId })
      }

      // Get summary data - separate query without ORDER BY
      const summary = await baseQuery
        .clone()
        .select("SUM(sale.totalPrice)", "totalSales")
        .addSelect("SUM(sale.profit)", "totalProfit")
        .addSelect("COUNT(sale.id)", "totalTransactions")
        .addSelect("AVG(sale.totalPrice)", "avgTransactionValue")
        .addSelect("SUM(sale.qtySold)", "totalQuantitySold")
        .getRawOne()

      // Get individual transactions for details - separate query with joins
      const transactions = await baseQuery
        .clone()
        .leftJoinAndSelect("sale.product", "product")
        .leftJoinAndSelect("sale.soldBy", "soldBy")
        .orderBy("sale.salesDate", "DESC")
        .getMany()

      // Get top products for this period - separate query with proper grouping
      const topProducts = await baseQuery
        .clone()
        .leftJoin("sale.product", "product")
        .select("product.name", "productName")
        .addSelect("SUM(sale.profit)", "totalProfit")
        .addSelect("SUM(sale.qtySold)", "totalQuantity")
        .addSelect("COUNT(sale.id)", "transactionCount")
        .addSelect("AVG(sale.unitPrice)", "avgUnitPrice")
        .groupBy("product.id, product.name")
        .orderBy("SUM(sale.profit)", "DESC")
        .limit(5)
        .getRawMany()

      // Format top products
      const formattedTopProducts = topProducts.map(product => ({
        productName: product.productName,
        totalProfit: formatNumber(Number(product.totalProfit)),
        totalProfitFormatted: formatCurrency(Number(product.totalProfit), currency as string),
        totalQuantity: Number(product.totalQuantity),
        transactionCount: Number(product.transactionCount),
        avgUnitPrice: formatNumber(Number(product.avgUnitPrice)),
        avgUnitPriceFormatted: formatCurrency(Number(product.avgUnitPrice), currency as string)
      }))

      // Create transaction details if requested
      let transactionDetails = []
      if (includeTransactionDetails === "true" && transactions.length > 0) {
        transactionDetails = transactions.map((transaction, index) => ({
          transactionId: transaction.saleNumber,
          description: `${transaction.product.name} (Qty: ${transaction.qtySold}, Profit: ${formatCurrency(Number(transaction.profit), currency as string)})`,
          date: transaction.salesDate.toISOString(),
          customerName: transaction.customerName || "Walk-in Customer",
          paymentMethod: transaction.paymentMethod,
          soldBy: `${transaction.soldBy.firstName} ${transaction.soldBy.lastName}`,
          amount: formatNumber(Number(transaction.totalPrice)),
          amountFormatted: formatCurrency(Number(transaction.totalPrice), currency as string),
          profit: formatNumber(Number(transaction.profit)),
          profitFormatted: formatCurrency(Number(transaction.profit), currency as string)
        }))
      }

      // Calculate enhanced metrics
      const totalSalesAmount = Number(summary?.totalSales || 0)
      const totalProfitAmount = Number(summary?.totalProfit || 0)
      const totalTransactionsCount = Number(summary?.totalTransactions || 0)
      const totalQuantitySold = Number(summary?.totalQuantitySold || 0)
      const avgTransactionValue = Number(summary?.avgTransactionValue || 0)
      const profitMargin = totalSalesAmount > 0 ? (totalProfitAmount / totalSalesAmount) * 100 : 0

      const result = {
        period: period as string,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        reportGeneratedAt: new Date().toISOString(),
        currency: currency as string,
        
        // Core metrics with formatting
        totalSales: formatNumber(totalSalesAmount),
        totalSalesFormatted: formatCurrency(totalSalesAmount, currency as string),
        totalProfit: formatNumber(totalProfitAmount),
        totalProfitFormatted: formatCurrency(totalProfitAmount, currency as string),
        totalTransactions: totalTransactionsCount,
        totalQuantitySold: totalQuantitySold,
        avgTransactionValue: formatNumber(avgTransactionValue),
        avgTransactionValueFormatted: formatCurrency(avgTransactionValue, currency as string),
        profitMargin: formatNumber(profitMargin),
        profitMarginFormatted: formatPercentage(profitMargin),

        // Additional insights
        insights: {
          averageItemsPerTransaction: formatNumber(totalTransactionsCount > 0 ? totalQuantitySold / totalTransactionsCount : 0),
          averageProfitPerTransaction: formatNumber(totalTransactionsCount > 0 ? totalProfitAmount / totalTransactionsCount : 0),
          averageProfitPerTransactionFormatted: formatCurrency(totalTransactionsCount > 0 ? totalProfitAmount / totalTransactionsCount : 0, currency as string),
          averageProfitPerItem: formatNumber(totalQuantitySold > 0 ? totalProfitAmount / totalQuantitySold : 0),
          averageProfitPerItemFormatted: formatCurrency(totalQuantitySold > 0 ? totalProfitAmount / totalQuantitySold : 0, currency as string)
        },

        // Product performance
        topProducts: formattedTopProducts,

        // Transaction details (optional)
        ...(includeTransactionDetails === "true" && { transactionDetails }),

        // Performance indicators
        performanceIndicators: {
          salesVelocity: `${totalTransactionsCount} transactions in ${period}`,
          topSellingProduct: formattedTopProducts[0]?.productName || "No sales",
          mostProfitableProduct: formattedTopProducts[0]?.productName || "No sales"
        }
      }

      return res.json({
        success: true,
        message: "Sales summary retrieved successfully",
        timestamp: new Date().toISOString(),
        data: result,
      })
    } catch (error) {
      console.error("Get sales summary error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch sales summary",
        timestamp: new Date().toISOString()
      })
    }
  }

  // ✅ Enhanced: Get specific employee sales with improved formatting
  static getEmployeeSales = async (req: Request, res: Response) => {
    try {
      // Role-based authorization
      if (req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "Only admins can access employee sales",
          timestamp: new Date().toISOString()
        })
      }

      const { employeeId } = req.params
      const { 
        startDate, 
        endDate, 
        status, 
        page = 1, 
        limit = 10, 
        currency = "RWF",
        includeProductDetails = "true" 
      } = req.query

      const saleRepository = dbConnection.getRepository(Sale)
      const pageNum = Number.parseInt(page as string)
      const limitNum = Number.parseInt(limit as string)
      const skip = (pageNum - 1) * limitNum

      let queryBuilder = saleRepository
        .createQueryBuilder("sale")
        .leftJoinAndSelect("sale.product", "product")
        .leftJoinAndSelect("product.category", "category")
        .leftJoinAndSelect("sale.soldBy", "soldBy")
        .leftJoinAndSelect("sale.approvedBy", "approvedBy")
        .where("sale.soldBy.id = :employeeId", { employeeId })

      if (status) {
        queryBuilder = queryBuilder.andWhere("sale.status = :status", { status })
      }

      if (startDate && endDate) {
        queryBuilder = queryBuilder.andWhere("sale.salesDate BETWEEN :startDate AND :endDate", {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        })
      }

      const total = await queryBuilder.getCount()
      const sales = await queryBuilder.orderBy("sale.salesDate", "DESC").skip(skip).take(limitNum).getMany()

      // Enhanced sales formatting
      const enhancedSales = sales.map(sale => ({
        ...sale,
        totalPriceFormatted: formatCurrency(Number(sale.totalPrice), currency as string),
        profitFormatted: formatCurrency(Number(sale.profit), currency as string),
        unitPriceFormatted: formatCurrency(Number(sale.unitPrice), currency as string),
        // Include product details conditionally
        ...(includeProductDetails === "true" && {
          productDetails: {
            name: sale.product.name,
            category: sale.product.category.name,
            sku: sale.product.sku,
            currentStock: sale.product.qtyInStock
          }
        })
      }))

      // Enhanced summary calculations
      const totalSalesAmount = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfitAmount = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)
      const approvedSales = sales.filter((s) => s.status === "approved")
      const pendingSales = sales.filter((s) => s.status === "pending")
      const rejectedSales = sales.filter((s) => s.status === "rejected")

      const enhancedSummary = {
        currency: currency as string,
        totalSales: formatNumber(totalSalesAmount),
        totalSalesFormatted: formatCurrency(totalSalesAmount, currency as string),
        totalProfit: formatNumber(totalProfitAmount),
        totalProfitFormatted: formatCurrency(totalProfitAmount, currency as string),
        totalTransactions: sales.length,
        avgTransactionValue: formatNumber(sales.length > 0 ? totalSalesAmount / sales.length : 0),
        avgTransactionValueFormatted: formatCurrency(sales.length > 0 ? totalSalesAmount / sales.length : 0, currency as string),
        profitMargin: formatNumber(totalSalesAmount > 0 ? (totalProfitAmount / totalSalesAmount) * 100 : 0),
        profitMarginFormatted: formatPercentage(totalSalesAmount > 0 ? (totalProfitAmount / totalSalesAmount) * 100 : 0),
        approvedSales: approvedSales.length,
        pendingSales: pendingSales.length,
        rejectedSales: rejectedSales.length,
        employeePerformance: {
          conversionRate: formatPercentage(sales.length > 0 ? (approvedSales.length / sales.length) * 100 : 0),
          avgProfitPerSale: formatNumber(sales.length > 0 ? totalProfitAmount / sales.length : 0),
          avgProfitPerSaleFormatted: formatCurrency(sales.length > 0 ? totalProfitAmount / sales.length : 0, currency as string)
        }
      }

      return res.json({
        success: true,
        message: "Employee sales retrieved successfully",
        timestamp: new Date().toISOString(),
        data: {
          employeeId: Number(employeeId),
          sales: enhancedSales,
          summary: enhancedSummary,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1,
            limit: limitNum
          },
        },
      })
    } catch (error) {
      console.error("Get employee sales error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch employee sales",
        timestamp: new Date().toISOString()
      })
    }
  }
}