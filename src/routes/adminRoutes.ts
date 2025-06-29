// @ts-nocheck

import { Router } from "express"
import { AdminController } from "../controllers/AdminController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"
import { body, param } from "express-validator"

const router = Router()

// Validation rules for creating employee
const createEmployeeValidation = [
  body("firstName").notEmpty().trim().withMessage("First name is required"),
  body("lastName").notEmpty().trim().withMessage("Last name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("telephone").notEmpty().trim().withMessage("Telephone is required"),
]

// Validation rules for adding product
const addProductValidation = [
  body("name").notEmpty().trim().withMessage("Product name is required"),
  body("category").notEmpty().trim().withMessage("Category is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("costPrice").isNumeric().withMessage("Cost price must be a number"),
  body("qtyInStock").isInt({ min: 0 }).withMessage("Quantity must be a non-negative integer"),
]

// Routes with authentication and authorization
router.post(
  "/create-employee",
  // authenticate,
  // authorize([UserRole.ADMIN]),
  createEmployeeValidation,
  AdminController.createEmployee,
)

router.get("/employees", authenticate, authorize([UserRole.ADMIN]), AdminController.listEmployees)

router.post("/add-product", authenticate, authorize([UserRole.ADMIN]), addProductValidation, AdminController.addProduct)

router.delete(
  "/delete-product/:id",
  authenticate,
  authorize([UserRole.ADMIN]),
  param("id").isInt().withMessage("Product ID must be an integer"),
  AdminController.deleteProduct,
)




router.get("/reports/daily", authenticate, authorize([UserRole.ADMIN]), AdminController.dailyReport)

router.get("/reports/weekly", authenticate, authorize([UserRole.ADMIN]), AdminController.weeklyReport)

router.get("/all-sales", authenticate, authorize([UserRole.ADMIN]), AdminController.getAllSales)
router.get("/pending-sales", authenticate, authorize([UserRole.ADMIN]), AdminController.getPendingSales)
router.post("/approve-sale/:id", authenticate, authorize([UserRole.ADMIN]), AdminController.approveSale)
router.post("/reject-sale/:id", authenticate, authorize([UserRole.ADMIN]), AdminController.rejectSale)
router.get("/employees", authenticate, authorize([UserRole.ADMIN]), AdminController.getAllEmployees)

export default router
