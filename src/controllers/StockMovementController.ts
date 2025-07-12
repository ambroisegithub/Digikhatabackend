import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { StockMovement } from "../database/models/StockMovement"
import { Product } from "../database/models/Product"
import { UserRole } from "../Enums/UserRole"

export class StockMovementController {
  // Record stock movement
  static async recordStockMovement(req: Request, res: Response) {
    const queryRunner = dbConnection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { productId } = req.params
      const { type, quantity, reason, costPrice, notes } = req.body
      const user = req.user

      // Find product
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: Number(productId) },
      })

      if (!product) {
        await queryRunner.rollbackTransaction()
        return res.status(404).json({
          success: false,
          message: "Product not found",
        })
      }

      // Check stock availability for outbound movements
      if (type === "out" && product.qtyInStock < quantity) {
        await queryRunner.rollbackTransaction()
        return res.status(400).json({
          success: false,
          message: "Insufficient stock",
          available: product.qtyInStock,
          requested: quantity,
        })
      }

      // Create stock movement record
      const stockMovement = queryRunner.manager.create(StockMovement, {
        product,
        type,
        quantity,
        costPrice: type === "in" ? costPrice || product.costPrice : product.costPrice,
        reason,
        notes,
        recordedBy: user,
        movementDate: new Date(),
      })

      await queryRunner.manager.save(stockMovement)

      // Update product stock
      const newStock = type === "in" ? product.qtyInStock + quantity : product.qtyInStock - quantity
      await queryRunner.manager.update(Product, productId, {
        qtyInStock: newStock,
      })

      await queryRunner.commitTransaction()

      // Fetch complete stock movement data
      const completeStockMovement = await dbConnection.getRepository(StockMovement).findOne({
        where: { id: stockMovement.id },
        relations: ["product", "recordedBy"],
      })

      return res.status(201).json({
        success: true,
        message: "Stock movement recorded successfully",
        data: completeStockMovement,
      })
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error("Record stock movement error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to record stock movement",
      })
    } finally {
      await queryRunner.release()
    }
  }

  // Get stock movements
  static async getStockMovements(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, type, productId, startDate, endDate } = req.query
      const pageNum = Number.parseInt(page as string)
      const limitNum = Number.parseInt(limit as string)
      const skip = (pageNum - 1) * limitNum

      const stockMovementRepository = dbConnection.getRepository(StockMovement)
      const queryBuilder = stockMovementRepository
        .createQueryBuilder("movement")
        .leftJoinAndSelect("movement.product", "product")
        .leftJoinAndSelect("movement.recordedBy", "recordedBy")

      // Apply filters
      if (type) {
        queryBuilder.andWhere("movement.type = :type", { type })
      }

      if (productId) {
        queryBuilder.andWhere("movement.product.id = :productId", { productId })
      }

      if (startDate) {
        queryBuilder.andWhere("movement.movementDate >= :startDate", { startDate: new Date(startDate as string) })
      }

      if (endDate) {
        queryBuilder.andWhere("movement.movementDate <= :endDate", { endDate: new Date(endDate as string) })
      }

      // Role-based filtering
      if (req.user?.role === UserRole.EMPLOYEE) {
        queryBuilder.andWhere("movement.recordedBy.id = :userId", { userId: req.userId })
      }

      const total = await queryBuilder.getCount()
      const movements = await queryBuilder.orderBy("movement.movementDate", "DESC").skip(skip).take(limitNum).getMany()

      return res.json({
        success: true,
        message: "Stock movements retrieved successfully",
        data: {
          movements,
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
      console.error("Get stock movements error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch stock movements",
      })
    }
  }

  // Get stock movements for specific product
  static async getProductStockMovements(req: Request, res: Response) {
    try {
      const { productId } = req.params
      const { limit = 20 } = req.query

      const stockMovementRepository = dbConnection.getRepository(StockMovement)
      const movements = await stockMovementRepository.find({
        where: { product: { id: Number(productId) } },
        relations: ["recordedBy"],
        order: { movementDate: "DESC" },
        take: Number(limit),
      })

      return res.json({
        success: true,
        message: "Product stock movements retrieved successfully",
        data: movements,
      })
    } catch (error) {
      console.error("Get product stock movements error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch product stock movements",
      })
    }
  }
}
