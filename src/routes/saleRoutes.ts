
// @ts-nocheck
import { Router } from "express"
import { body } from "express-validator"
import { EnhancedSaleController } from "../controllers/SaleController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"
const router = Router()
router.use(authenticate)
router.use(authorize([UserRole.EMPLOYEE,UserRole.ADMIN]));

router.post(
  "/",
  [
    body("productId").isNumeric().withMessage("Valid product ID is required"),
    body("qtySold").isInt({ min: 1 }).withMessage("Valid quantity is required"),
    body("paymentMethod").optional().isIn(["cash", "card", "mobile", "credit"]).withMessage("Invalid payment method"),
  ],
  EnhancedSaleController.createSale,
)

router.get("/", EnhancedSaleController.getSales)
router.get("/summary", EnhancedSaleController.getSalesSummary)
router.get("/employee/:employeeId", EnhancedSaleController.getEmployeeSales)

export default router
