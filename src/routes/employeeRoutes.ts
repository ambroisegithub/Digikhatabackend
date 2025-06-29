
// @ts-nocheck
import { Router } from "express"
import { EmployeeController } from "../controllers/EmployeeController"
import { authenticate } from "../middlewares/authMiddleware"
import { body } from "express-validator"

const router = Router()

// Validation rules for login
const loginValidation = [
  body("username").notEmpty().withMessage("Username is required"),
  body("password").notEmpty().withMessage("Password is required"),
]

// Validation rules for selling product
const sellProductValidation = [
  body("productId").isInt().withMessage("Product ID must be an integer"),
  body("qtySold").isInt({ min: 1 }).withMessage("Quantity must be a positive integer"),
]

// Routes
router.post("/login", loginValidation, EmployeeController.login)

router.post("/sell-product", authenticate, sellProductValidation, EmployeeController.sellProduct)

router.get("/products", authenticate, EmployeeController.listProducts)

router.get("/my-sales", authenticate, EmployeeController.viewMySales)

export default router
