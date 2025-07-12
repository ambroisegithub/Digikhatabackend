import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { body } from "express-validator";

const router = Router();

// Employee registration validation
const registerEmployeeValidation = [
  body("lastName").notEmpty().trim().withMessage("Last Name is required"),
  body("firstName").notEmpty().trim().withMessage("First Name is required"),
  body("telephone").notEmpty().trim().withMessage("Telephone is required"),
  body("email").isEmail().withMessage("Valid email is required")
];

// OTP verification validation
const otpVerificationValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits")
];

// Password change validation
const changePasswordValidation = [
  body("resetToken").notEmpty().withMessage("Reset token is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    )
];

// Legacy password reset validation (kept for backward compatibility)
const passwordResetValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    )
];

// Admin-only routes
router.post(
  "/register-employee",
  registerEmployeeValidation,
  AuthController.registerEmployee
);


// Step 1: Request password reset (sends OTP to email)
router.post(
  "/request-password-reset",
  body("email").isEmail().withMessage("Valid email is required"),
  AuthController.requestPasswordReset
);

// Step 2: Verify OTP (returns reset token)
router.post(
  "/verify-otp",
  otpVerificationValidation,
  AuthController.verifyOTP
);

// Step 3: Change password using reset token
router.post(
  "/change-password",
  changePasswordValidation,
  AuthController.changePassword
);

// Legacy endpoint (kept for backward compatibility - combines steps 2 and 3)
router.post(
  "/reset-password",
  passwordResetValidation,
  AuthController.resetPassword
);
router.get(
  "/all",
  AuthController.getAllEmployees
);
export default router;