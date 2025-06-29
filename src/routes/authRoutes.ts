// @ts-nocheck
import { Router } from "express"
import { AuthController } from "../controllers/AuthController"
import { body } from "express-validator"
import { authenticate } from "../middlewares/authMiddleware"

const router = Router()

// Validation rules for registration
const registerValidation = [
  body("lastName").notEmpty().trim().withMessage("Last Name is required"),
  body("firstName").notEmpty().trim().withMessage("First Name is required"),
  body("telephone").notEmpty().trim().withMessage("Telephone Number is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  body("role").optional().isIn(["admin", "employee"]).withMessage("Role must be either admin or employee"),
]

// Validation rules for login (updated to use email instead of username)
const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
]

// Validation rules for password change
const changePasswordValidation = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    ),
]

// Routes
router.post("/register", registerValidation, AuthController.register)
router.post("/login", loginValidation, AuthController.login)
router.post("/change-password", authenticate, changePasswordValidation, AuthController.changePassword)

export default router