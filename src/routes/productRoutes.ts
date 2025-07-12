// @ts-nocheck
import { Router } from "express"
import { body } from "express-validator"
import { EnhancedProductController } from "../controllers/ProductController"
import { authenticate } from "../middlewares/authMiddleware"

const router = Router()

router.use(authenticate)

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

router.post(
  "/:id/stock",
  [
    body("type").isIn(["in", "out"]).withMessage("Type must be 'in' or 'out'"),
    body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer"),
    body("reason").notEmpty().withMessage("Reason is required"),
    body("costPrice").if(body("type").equals("in")).isFloat({ min: 0.01}).withMessage("Valid cost price is required for stock in"),
  ],
  EnhancedProductController.updateProductStock
);
router.get("/:id", EnhancedProductController.getProductDetails)
router.get("/", EnhancedProductController.listProducts)
router.get("/low-stock", EnhancedProductController.getLowStockProducts)
router.get("/employee/:employeeId", EnhancedProductController.getEmployeeProducts)
router.get("/:id/profit-analysis", EnhancedProductController.getProductProfitAnalysis)

export default router
