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
  body("role").optional().isIn(["admin", "employee"]).withMessage("Role must be either admin or employee"),
]

// Validation rules for login (updated to use email instead of username)
const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
]

// Validation rules for OTP verification
const otpVerificationValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
]

// Validation rules for password change
const changePasswordValidation = [
  body("resetToken").notEmpty().withMessage("Reset token is required"),
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

// NEW SEPARATE ENDPOINTS FOR PASSWORD RESET FLOW
router.post("/request-password-reset", 
  body("email").isEmail().withMessage("Valid email is required"),
  AuthController.requestPasswordReset
)

router.post("/verify-otp", 
  otpVerificationValidation, 
  AuthController.verifyOTP
)

router.post("/change-password", 
  changePasswordValidation, 
  AuthController.changePassword
)

// LEGACY ENDPOINT (kept for backward compatibility)
router.post("/reset-password", 
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage(
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      ),
  ],
  AuthController.resetPassword
)

// Add this route to your authRoutes.ts
router.put("/:id", 
  authenticate,
  [
    body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),
    body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),
    body("telephone").optional().trim().notEmpty().withMessage("Telephone cannot be empty")
  ],
  AuthController.updateProfile
)

export default router