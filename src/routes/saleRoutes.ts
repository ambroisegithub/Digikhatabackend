// @ts-nocheck


import { Router } from "express"
import { body } from "express-validator"
import { SaleController } from "../controllers/SaleController"
import {authenticate} from "../middlewares/authMiddleware"


const router = Router()

// Apply authentication middleware to all routes
router.use(authenticate)

// Validation rules for creating a sale
const createSaleValidation = [
  body("productId").isInt({ min: 1 }).withMessage("Valid product ID is required"),
  body("qtySold").isInt({ min: 1 }).withMessage("Quantity sold must be at least 1"),
  body("paymentMethod").optional().isIn(["cash", "card", "mobile", "credit"]).withMessage("Invalid payment method"),
  body("customerName").optional().isString().trim().isLength({ max: 100 }).withMessage("Customer name too long"),
  body("customerPhone").optional().isString().trim().isLength({ max: 20 }).withMessage("Customer phone too long"),
  body("notes").optional().isString().trim().isLength({ max: 500 }).withMessage("Notes too long"),
]

// Routes
router.post("/", createSaleValidation, SaleController.createSale)
router.get("/", SaleController.getSales)
router.get("/summary", SaleController.getSalesSummary)
router.get("/:id", SaleController.getSaleById)
router.patch("/:id/approve", SaleController.approveSale)
router.patch("/:id/reject", SaleController.rejectSale)

export default router
