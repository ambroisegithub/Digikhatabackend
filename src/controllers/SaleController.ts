import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Sale } from "../database/models/Sale"
import { Product } from "../database/models/Product"
import { StockMovement } from "../database/models/StockMovement"

export class SaleController {
  // Create a new sale
  static async createSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { productId, qtySold, paymentMethod, customerName, customerPhone, notes } = req.body
      const user = req.user

      if (!user) {
        return res.status(401).json({ message: "Authentication required" })
      }

      // Find product
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: productId },
      })

      if (!product) {
        await queryRunner.rollbackTransaction()
        return res.status(404).json({ message: "Product not found" })
      }

      // Check if enough stock is available
      if (product.qtyInStock < qtySold) {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
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

      // Update product stock (temporarily reduce for pending sale)
      await queryRunner.manager.update(Product, productId, {
        qtyInStock: product.qtyInStock - qtySold,
      })

      // Create stock movement record
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

      res.status(201).json({
        success: true,
        message: "Sale created successfully, awaiting approval",
        data: completeSale,
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Create sale error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to create sale",
      })
    } finally {
      await queryRunner.release()
    }
  }

  // Get all sales with pagination and filters
  static async getSales(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, status, startDate, endDate, paymentMethod, productId } = req.query

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

      // Apply filters
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

      res.json({
        success: true,
        data: {
          sales,
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
      console.error("Get sales error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch sales",
      })
    }
  }

  // Get sale by ID
  static async getSaleById(req: Request, res: Response) {
    try {
      const { id } = req.params

      const sale = await dbConnection.getRepository(Sale).findOne({
        where: { id: Number.parseInt(id) },
        relations: ["product", "product.category", "soldBy", "approvedBy"],
      })

      if (!sale) {
        return res.status(404).json({
          success: false,
          message: "Sale not found",
        })
      }

      res.json({
        success: true,
        data: sale,
      })
    } catch (error) {
      console.error("Get sale by ID error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch sale",
      })
    }
  }

  // Get sales summary
  static async getSalesSummary(req: Request, res: Response) {
    try {
      const { period = "today" } = req.query
      const now = new Date()
      let startDate: Date

      switch (period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      }

      const summary = await dbConnection
        .getRepository(Sale)
        .createQueryBuilder("sale")
        .select("SUM(sale.totalPrice)", "totalSales")
        .addSelect("SUM(sale.profit)", "totalProfit")
        .addSelect("COUNT(sale.id)", "totalTransactions")
        .addSelect("AVG(sale.totalPrice)", "avgTransactionValue")
        .where("sale.salesDate >= :startDate", { startDate })
        .andWhere("sale.status = :status", { status: "approved" })
        .getRawOne()

      const result = {
        totalSales: Number(summary?.totalSales || 0),
        totalProfit: Number(summary?.totalProfit || 0),
        totalTransactions: Number(summary?.totalTransactions || 0),
        avgTransactionValue: Number(summary?.avgTransactionValue || 0),
      }

      res.json({
        success: true,
        data: {
          period,
          ...result,
        },
      })
    } catch (error) {
      console.error("Get sales summary error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch sales summary",
      })
    }
  }

  // Approve sale (Admin only)
  static async approveSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const { id } = req.params
      const user = req.user

      if (!user) {
        return res.status(401).json({ message: "Authentication required" })
      }

      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: Number.parseInt(id) },
        relations: ["product"],
      })

      if (!sale) {
        await queryRunner.rollbackTransaction()
        return res.status(404).json({ message: "Sale not found" })
      }

      if (sale.status !== "pending") {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          message: `Sale is already ${sale.status}`,
        })
      }

      // Update sale status and approver
      await queryRunner.manager.update(Sale, id, {
        status: "approved",
        approvedBy: user,
      })

      // Update product profit tracking
      await queryRunner.manager.update(Product, sale.product.id, {
        totalProfit: () => `totalProfit + ${sale.profit}`,
        totalSales: () => `totalSales + ${sale.totalPrice}`,
        lastSaleDate: new Date(),
      })

      await queryRunner.commitTransaction()

      // Fetch updated sale
      const updatedSale = await dbConnection.getRepository(Sale).findOne({
        where: { id: Number.parseInt(id) },
        relations: ["product", "product.category", "soldBy", "approvedBy"],
      })

      res.json({
        success: true,
        message: "Sale approved successfully",
        data: updatedSale,
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Approve sale error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to approve sale",
      })
    } finally {
      await queryRunner.release()
    }
  }

  // Reject sale (Admin only)
  static async rejectSale(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const { id } = req.params
      const user = req.user

      if (!user) {
        return res.status(401).json({ message: "Authentication required" })
      }

      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: Number.parseInt(id) },
        relations: ["product"],
      })

      if (!sale) {
        await queryRunner.rollbackTransaction()
        return res.status(404).json({ message: "Sale not found" })
      }

      if (sale.status !== "pending") {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          message: `Sale is already ${sale.status}`,
        })
      }

      // Restore stock quantity since sale is rejected
      await queryRunner.manager.update(Product, sale.product.id, {
        qtyInStock: () => `qtyInStock + ${sale.qtySold}`,
      })

      // Update sale status
      await queryRunner.manager.update(Sale, id, {
        status: "rejected",
        approvedBy: user,
      })

      await queryRunner.commitTransaction()

      // Fetch updated sale
      const updatedSale = await dbConnection.getRepository(Sale).findOne({
        where: { id: Number.parseInt(id) },
        relations: ["product", "product.category", "soldBy", "approvedBy"],
      })

      res.json({
        success: true,
        message: "Sale rejected successfully and stock restored",
        data: updatedSale,
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Reject sale error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to reject sale",
      })
    } finally {
      await queryRunner.release()
    }
  }
}
