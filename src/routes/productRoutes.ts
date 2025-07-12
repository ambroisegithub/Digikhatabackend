// @ts-nocheck
import { Router } from "express"
import { body } from "express-validator"
import { EnhancedProductController } from "../controllers/ProductController"
import { authenticate } from "../middlewares/authMiddleware"

const router = Router()

router.use(authenticate)

// Product routes
router.post(
  "/",
  [
    body("name").notEmpty().withMessage("Product name is required"),
    body("categoryId").isNumeric().withMessage("Valid category ID is required"),
    body("productTypeId").notEmpty().withMessage("Product type ID is required"),
    body("price").isFloat({ min: 0 }).withMessage("Valid price is required"),
    body("costPrice").isFloat({ min: 0 }).withMessage("Valid cost price is required"),
    body("qtyInStock").isInt({ min: 0 }).withMessage("Valid quantity is required"),
  ],
  EnhancedProductController.createProduct,
)
router.get("/:id", EnhancedProductController.getProductDetails)
router.get("/", EnhancedProductController.listProducts)
router.get("/low-stock", EnhancedProductController.getLowStockProducts)
router.get("/employee/:employeeId", EnhancedProductController.getEmployeeProducts)
router.get("/:id/profit-analysis", EnhancedProductController.getProductProfitAnalysis)

export default router
