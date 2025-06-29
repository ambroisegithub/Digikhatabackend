// @ts-nocheck
import { Router } from "express"
import { StockMovementController } from "../controllers/StockMovementController"
import { authenticate } from "../middlewares/authMiddleware"
import { param } from "express-validator"

const router = Router()

// Routes with authentication
router.get("/", authenticate, StockMovementController.listStockMovements)

router.get(
  "/:id",
  authenticate,
  param("id").isInt().withMessage("Stock movement ID must be an integer"),
  StockMovementController.getStockMovement,
)

export default router
