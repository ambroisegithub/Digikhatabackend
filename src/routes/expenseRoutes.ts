
// @ts-nocheck
import { Router } from "express"
import { body, query } from "express-validator"
import { ExpenseController } from "../controllers/ExpenseController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"

const router = Router()

router.use(authenticate)


router.post(
  "/monthly",
  [
    body("description")
      .notEmpty()
      .withMessage("Description is required")
      .isLength({ min: 3, max: 255 })
      .withMessage("Description must be between 3-255 characters"),
    
    body("amount")
      .isFloat({ min: 0.01 })
      .withMessage("Valid amount greater than 0 is required"),
    
    body("category")
      .isIn(["rent", "utilities", "marketing", "supplies", "maintenance", "transport", "insurance", "other"])
      .withMessage("Valid expense category is required"),
    
    body("expenseDate")
      .isISO8601()
      .withMessage("Valid expense date in ISO format is required"),
    
    body("notes")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Notes cannot exceed 500 characters"),
    
    body("receiptNumber")
      .optional()
      .isLength({ max: 100 })
      .withMessage("Receipt number cannot exceed 100 characters"),
    
    body("vendor")
      .optional()
      .isLength({ max: 255 })
      .withMessage("Vendor name cannot exceed 255 characters"),
    
    body("isRecurring")
      .optional()
      .isBoolean()
      .withMessage("isRecurring must be boolean"),
  ],
  authorize([UserRole.ADMIN, UserRole.EMPLOYEE]),
  ExpenseController.addMonthlyExpense,
)


router.get(
  "/summary",
  [
    query("month")
      .optional()
      .isInt({ min: 1, max: 12 })
      .withMessage("Month must be between 1-12"),
    
    query("year")
      .optional()
      .isInt({ min: 2020, max: 2030 })
      .withMessage("Year must be between 2020-2030"),
    
    query("currency")
      .optional()
      .isLength({ min: 3, max: 3 })
      .withMessage("Currency must be 3 characters"),
    
    query("includeCalendarView")
      .optional()
      .isBoolean()
      .withMessage("includeCalendarView must be boolean"),
    
    query("includeTransactionDetails")
      .optional()
      .isBoolean()
      .withMessage("includeTransactionDetails must be boolean"),
  ],
  authorize([UserRole.ADMIN, UserRole.EMPLOYEE]),
  ExpenseController.getExpensesSummary,
)

export default router