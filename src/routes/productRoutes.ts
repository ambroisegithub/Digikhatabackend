// @ts-nocheck

import { Router } from "express"
import { ProductController } from "../controllers/ProductController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"
import { body, param } from "express-validator"

const router = Router()

// Validation rules for creating product
const createProductValidation = [
  body("name").notEmpty().trim().withMessage("Product name is required"),
  body("categoryId").isInt().withMessage("Category ID must be an integer"),
  body("productTypeId").notEmpty().withMessage("Product type ID is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("costPrice").isNumeric().withMessage("Cost price must be a number"),
  body("qtyInStock").isInt({ min: 0 }).withMessage("Quantity must be a non-negative integer"),
  body("description").optional().trim(),
  body("sku").optional().trim(),
  body("size").optional().trim(),
  body("color").optional().trim(),
  body("otherAttributes").optional().trim(),
]

// Validation rules for updating product
const updateProductValidation = [
  param("id").isInt().withMessage("Product ID must be an integer"),
  body("name").optional().trim(),
  body("categoryId").optional().isInt().withMessage("Category ID must be an integer"),
  body("productTypeId").optional().notEmpty().withMessage("Product type ID is required"),
  body("price").optional().isNumeric().withMessage("Price must be a number"),
  body("costPrice").optional().isNumeric().withMessage("Cost price must be a number"),
  body("description").optional().trim(),
  body("sku").optional().trim(),
  body("size").optional().trim(),
  body("color").optional().trim(),
  body("otherAttributes").optional().trim(),
]

// Validation rules for updating stock
const updateStockValidation = [
  param("id").isInt().withMessage("Product ID must be an integer"),
  body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer"),
  body("type").isIn(["in", "out"]).withMessage("Type must be 'in' or 'out'"),
  body("reason").notEmpty().trim().withMessage("Reason is required"),
  body("costPrice").optional().isNumeric().withMessage("Cost price must be a number"),
]

// Routes with authentication and authorization
router.post("/", authenticate, authorize([UserRole.ADMIN]), createProductValidation, ProductController.createProduct)

router.get("/", authenticate, ProductController.listProducts)

router.get(
  "/:id",
  authenticate,
  param("id").isInt().withMessage("Product ID must be an integer"),
  ProductController.getProduct,
)

router.put("/:id", authenticate, authorize([UserRole.ADMIN]), updateProductValidation, ProductController.updateProduct)

router.post(
  "/:id/stock",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.EMPLOYEE]),
  updateStockValidation,
  ProductController.updateStock,
)

router.get(
  "/:id/profit-analysis",
  authenticate,
  param("id").isInt().withMessage("Product ID must be an integer"),
  ProductController.getProductProfitAnalysis,
)

export default router
