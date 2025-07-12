// @ts-nocheck
import { Router } from "express"
import { body } from "express-validator"
import { StockMovementController } from "../controllers/StockMovementController"
import { authenticate } from "../middlewares/authMiddleware"

const router = Router()

// Apply authentication middleware to all routes
router.use(authenticate)

// Stock movement routes
router.post(
  "/:productId",
  [
    body("type").isIn(["in", "out"]).withMessage("Type must be 'in' or 'out'"),
    body("quantity").isInt({ min: 1 }).withMessage("Valid quantity is required"),
    body("reason").notEmpty().withMessage("Reason is required"),
    body("costPrice").optional().isFloat({ min: 0 }).withMessage("Valid cost price is required"),
  ],
  StockMovementController.recordStockMovement,
)

router.get("/", StockMovementController.getStockMovements)
router.get("/product/:productId", StockMovementController.getProductStockMovements)

export default router
