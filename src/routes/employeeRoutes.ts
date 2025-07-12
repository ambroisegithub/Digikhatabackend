// @ts-nocheck
import { Router } from "express"
import { body } from "express-validator"
import { EmployeeController } from "../controllers/EmployeeController"
import { AuthController } from "../controllers/AuthController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"

const router = Router()

router.use(authenticate);
router.use(authorize([UserRole.EMPLOYEE,UserRole.ADMIN]));

// Employee login (no auth required)
router.post(
  "/login",
  [
    body("username").notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  EmployeeController.login,
)

// Apply authentication and employee-only middleware to all other routes
// router.use(authMiddleware, employeeOnly)

// Product access (employees can view ALL products)
router.get("/products", EmployeeController.listAllProducts)

// Sales management
router.post(
  "/sell",
  [
    body("productId").isNumeric().withMessage("Valid product ID is required"),
    body("qtySold").isInt({ min: 1 }).withMessage("Valid quantity is required"),
    body("paymentMethod").optional().isIn(["cash", "card", "mobile", "credit"]).withMessage("Invalid payment method"),
  ],
  EmployeeController.sellProduct,
)
router.get("/dashboard", EmployeeController.getEmployeeDashboardOverview);
router.get("/sales", EmployeeController.viewMySales)
router.get("/all", AuthController.getAllEmployees)
router.get("/sales/daily-summary", EmployeeController.getDailySalesSummary)
router.get("/performance", EmployeeController.getProductPerformance)

export default router
