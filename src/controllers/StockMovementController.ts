import type { Request, Response } from "express"
import dbConnection from "../database"
import { StockMovement } from "../database/models/StockMovement"
import { Between } from "typeorm"

export class StockMovementController {
  // List stock movements with filtering
  static async listStockMovements(req: Request, res: Response) {
    try {
      const stockMovementRepository = dbConnection.getRepository(StockMovement)

      // Get query parameters for filtering
      const { productId, type, startDate, endDate } = req.query

      // Build query conditions
      const queryConditions: any = {}

      if (productId) {
        queryConditions.product = { id: productId }
      }

      if (type && (type === "in" || type === "out")) {
        queryConditions.type = type
      }

      if (startDate && endDate) {
        queryConditions.movementDate = Between(new Date(startDate as string), new Date(endDate as string))
      }

      // Find stock movements based on conditions
      const stockMovements = await stockMovementRepository.find({
        where: queryConditions,
        relations: ["product", "product.productType", "recordedBy"],
        order: { movementDate: "DESC" },
      })

      return res.status(200).json({
        message: "Stock movements retrieved successfully",
        count: stockMovements.length,
        data: stockMovements,
      })
    } catch (error) {
      console.error("Error listing stock movements:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Get stock movement details
  static async getStockMovement(req: Request, res: Response) {
    try {
      const stockMovementRepository = dbConnection.getRepository(StockMovement)
      const movementId = Number.parseInt(req.params.id)

      // Find stock movement with related data
      const stockMovement = await stockMovementRepository.findOne({
        where: { id: movementId },
        relations: ["product", "product.productType", "recordedBy"],
      })

      if (!stockMovement) {
        return res.status(404).json({ message: "Stock movement not found" })
      }

      return res.status(200).json({
        message: "Stock movement retrieved successfully",
        data: stockMovement,
      })
    } catch (error) {
      console.error("Error getting stock movement:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }
}
