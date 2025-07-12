// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { User } from "../database/models/User";
import { UserRole } from "../Enums/UserRole";
import dbConnection from "../database/index";
import { generateOTP, generatePassword } from "../utils/helper";
import { sendEmployeeWelcomeEmail, sendPasswordResetEmail } from "../templates/employeeEmails";

type ExpressHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Debug utility function
const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`=== END DEBUG: ${context} ===\n`);
};

const excludePassword = (user: User) => {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export class AuthController {

// Add this method to your AuthController class
static updateProfile: ExpressHandler = async (req, res) => {
  try {
    debugLog("UPDATE_PROFILE - Incoming Request", {
      body: req.body,
      params: req.params,
      headers: req.headers
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      debugLog("UPDATE_PROFILE - Validation Errors", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    if (!dbConnection.isInitialized) {
      debugLog("UPDATE_PROFILE - Database Connection", "Initializing database connection");
      await dbConnection.initialize();
    }

    const userRepository = dbConnection.getRepository(User);
    const userId = parseInt(req.params.id);
    const { firstName, lastName, telephone } = req.body;

    debugLog("UPDATE_PROFILE - User Lookup", { userId });

    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      debugLog("UPDATE_PROFILE - User Not Found", { userId });
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Update user fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.telephone = telephone || user.telephone;

    debugLog("UPDATE_PROFILE - Updating User", {
      updates: {
        firstName: user.firstName,
        lastName: user.lastName,
        telephone: user.telephone
      }
    });

    await userRepository.save(user);

    const responseData = {
      success: true,
      message: "Profile updated successfully",
      data: excludePassword(user)
    };

    debugLog("UPDATE_PROFILE - Success Response", responseData);

    return res.status(200).json(responseData);

  } catch (error: any) {
    debugLog("UPDATE_PROFILE - Error", {
      message: error.message,
      stack: error.stack
    });
    console.error("Profile update error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
  static register: ExpressHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Debug: Log incoming request
      debugLog("REGISTER_EMPLOYEE - Incoming Request", {
        body: req.body,
        headers: req.headers,
        method: req.method,
        url: req.url,
        contentType: req.get('Content-Type')
      });

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        debugLog("REGISTER_EMPLOYEE - Validation Errors", {
          errors: errors.array(),
          errorCount: errors.array().length
        });
        return res.status(400).json({ 
          success: false,
          message: "Validation failed",
          errors: errors.array() 
        });
      }

      debugLog("REGISTER_EMPLOYEE - Validation", "Validation passed successfully");

      // Check database connection
      if (!dbConnection.isInitialized) {
        debugLog("REGISTER_EMPLOYEE - Database Connection", "Initializing database connection");
        await dbConnection.initialize();
      }

      debugLog("REGISTER_EMPLOYEE - Database Connection", "Database connection is ready");

      const userRepository = dbConnection.getRepository(User);
      const { lastName, firstName, telephone, email ,role} = req.body;

      // Debug: Log extracted data
      debugLog("REGISTER_EMPLOYEE - Extracted Data", {
        lastName,
        firstName,
        telephone,
        email,
        role,
        dataTypes: {
          lastName: typeof lastName,
          firstName: typeof firstName,
          telephone: typeof telephone,
          email: typeof email
        }
      });

      // Validate required fields
      const requiredFields = { lastName, firstName, telephone, email,role };
      const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value || value.trim() === '')
        .map(([key]) => key);

      if (missingFields.length > 0) {
        debugLog("REGISTER_EMPLOYEE - Missing Fields", { missingFields });
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
          missingFields
        });
      }

      // Check if email exists
      debugLog("REGISTER_EMPLOYEE - Email Check", `Checking if email ${email} exists`);
      const existingUser = await userRepository.findOne({ where: { email } });
      
      if (existingUser) {
        debugLog("REGISTER_EMPLOYEE - Email Check", {
          message: "Email already exists",
          existingUser: {
            id: existingUser.id,
            email: existingUser.email,
            username: existingUser.username,
            role: existingUser.role
          }
        });
        return res.status(400).json({ 
          success: false,
          message: "Email already exists" 
        });
      }

      debugLog("REGISTER_EMPLOYEE - Email Check", "Email is available");

      // Generate random password
      const tempPassword = generatePassword();
      debugLog("REGISTER_EMPLOYEE - Password Generation", "Temporary password generated");

      const hashedPassword = await bcrypt.hash(tempPassword, 12);
      debugLog("REGISTER_EMPLOYEE - Password Hashing", "Password hashed successfully");

      // Generate username
      const baseUsername = `${firstName} ${lastName}`;
      let username = baseUsername;
      let counter = 1;
      
      debugLog("REGISTER_EMPLOYEE - Username Generation", { baseUsername });
      
      while (await userRepository.findOne({ where: { username } })) {
        username = `${baseUsername}${counter}`;
        counter++;
        debugLog("REGISTER_EMPLOYEE - Username Generation", { 
          attempt: counter, 
          username: username 
        });
      }

      debugLog("REGISTER_EMPLOYEE - Username Generation", { 
        finalUsername: username, 
        attempts: counter 
      });

      // Create employee data
      const employeeData = {
        username,
        email,
        password: hashedPassword,
        telephone,
        firstName,
        lastName,
        role,
        isVerified: true,
        isFirstLogin: true,
        is2FAEnabled: false,
        otpAttempts: 0
      };

      debugLog("REGISTER_EMPLOYEE - Employee Data for Creation", {
        ...employeeData,
        password: "[HIDDEN]"
      });

      // Create employee entity
      const employee = userRepository.create(employeeData);
      debugLog("REGISTER_EMPLOYEE - Employee Entity", "Employee entity created successfully");

      // Save employee to database
      debugLog("REGISTER_EMPLOYEE - Database Save", "Attempting to save employee to database");
      await userRepository.save(employee);
      debugLog("REGISTER_EMPLOYEE - Database Save", "Employee saved successfully");

      // Send welcome email with credentials
      try {
        debugLog("REGISTER_EMPLOYEE - Email Sending", {
          email,
          name: `${firstName} ${lastName}`,
          hasEmailConfig: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
        });

        await sendEmployeeWelcomeEmail(email, `${firstName} ${lastName}`, tempPassword);
        debugLog("REGISTER_EMPLOYEE - Email Sending", "Welcome email sent successfully");
      } catch (emailError: any) {
        debugLog("REGISTER_EMPLOYEE - Email Error", {
          message: emailError.message,
          stack: emailError.stack,
          emailConfig: {
            hasEmailUser: !!process.env.EMAIL_USER,
            hasEmailPass: !!process.env.EMAIL_PASS,
            emailUser: process.env.EMAIL_USER
          }
        });
        
        // Don't fail the registration if email fails
        console.warn("Email sending failed but employee was created:", emailError);
      }

      const responseData = {
        success: true,
        message: "Employee registered successfully",
        data: excludePassword(employee)
      };

      debugLog("REGISTER_EMPLOYEE - Success Response", responseData);

      return res.status(201).json(responseData);

    } catch (error: any) {
      debugLog("REGISTER_EMPLOYEE - Error", {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
        table: error.table,
        column: error.column
      });

      console.error("Employee registration error:", error);
      
      return res.status(500).json({
        success: false,
        message: "An error occurred while registering the employee",
        error: process.env.NODE_ENV === "development" ? {
          message: error.message,
          code: error.code,
          constraint: error.constraint,
          detail: error.detail
        } : undefined
      });
    }
  };

  static login: ExpressHandler = async (req, res) => {
    try {
      debugLog("LOGIN - Incoming Request", {
        body: { ...req.body, password: "[HIDDEN]" },
        headers: req.headers,
        method: req.method,
        url: req.url
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        debugLog("LOGIN - Validation Errors", errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      if (!dbConnection.isInitialized) {
        debugLog("LOGIN - Database Connection", "Initializing database connection");
        await dbConnection.initialize();
      }

      const userRepository = dbConnection.getRepository(User);
      const { email, password } = req.body;

      debugLog("LOGIN - User Lookup", { email });

      // Query only the columns that exist in the database
      const user = await userRepository
        .createQueryBuilder("user")
        .where("user.email = :email", { email })
        .getOne();

      if (!user) {
        debugLog("LOGIN - User Not Found", { email });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      debugLog("LOGIN - User Found", {
        id: user.id,
        email: user.email,
        role: user.role,
        isFirstLogin: user.isFirstLogin
      });

      // Check if user is active (only if the column exists)
      // For now, we'll assume all users are active until the column is added
      const isActive = user.isActive !== undefined ? user.isActive : true;
      
      if (!isActive) {
        debugLog("LOGIN - User Inactive", { userId: user.id });
        return res.status(403).json({
          message: "Account is inactive. Please contact admin."
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        debugLog("LOGIN - Invalid Password", { userId: user.id });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      debugLog("LOGIN - Password Valid", { userId: user.id });

      // Check if first login
      if (user.isFirstLogin) {
        debugLog("LOGIN - First Login Detected", { userId: user.id });
        return res.status(403).json({
          message: "First login detected. Please reset your password.",
          requiresPasswordReset: true
        });
      }

      // Update last login
      user.lastLoginAt = new Date();
      await userRepository.save(user);

      // Generate JWT
      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" }
      );

      debugLog("LOGIN - Success", {
        userId: user.id,
        role: user.role,
        tokenGenerated: !!token
      });

      return res.json({
        message: "Login successful",
        data: excludePassword(user),
        token
      });
    } catch (error: any) {
      debugLog("LOGIN - Error", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      console.error("Login error:", error);
      return res.status(500).json({
        message: "An error occurred during login",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  static requestPasswordReset: ExpressHandler = async (req, res) => {
    try {
      debugLog("PASSWORD_RESET_REQUEST - Incoming Request", {
        body: req.body,
        headers: req.headers
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        debugLog("PASSWORD_RESET_REQUEST - Validation Errors", errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      const userRepository = dbConnection.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        debugLog("PASSWORD_RESET_REQUEST - User Not Found", { email });
        // Don't reveal if user exists for security
        return res.status(200).json({
          success: true,
          message: "If the email exists, an OTP will be sent"
        });
      }

      debugLog("PASSWORD_RESET_REQUEST - User Found", {
        id: user.id,
        email: user.email
      });

      const otp = generateOTP();
      user.resetPasswordToken = await bcrypt.hash(otp, 10);
      user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await userRepository.save(user);

      debugLog("PASSWORD_RESET_REQUEST - OTP Generated", {
        userId: user.id,
        otpLength: otp.length,
        expiresAt: user.resetPasswordExpires
      });

      // Send OTP email
      try {
        await sendPasswordResetEmail(
          user.email,
          `${user.firstName} ${user.lastName}`,
          otp
        );
        debugLog("PASSWORD_RESET_REQUEST - Email Sent", { userId: user.id });
      } catch (emailError: any) {
        debugLog("PASSWORD_RESET_REQUEST - Email Error", {
          message: emailError.message,
          userId: user.id
        });
      }

      return res.status(200).json({
        success: true,
        message: "If the email exists, an OTP will be sent"
      });
    } catch (error: any) {
      debugLog("PASSWORD_RESET_REQUEST - Error", {
        message: error.message,
        stack: error.stack
      });
      console.error("Password reset error:", error);
      return res.status(500).json({
        message: "An error occurred while processing your request"
      });
    }
  };

  // NEW ENDPOINT: Verify OTP only (separate from password change)
  static verifyOTP: ExpressHandler = async (req, res) => {
    try {
      debugLog("OTP_VERIFY - Incoming Request", {
        body: { ...req.body, otp: "[HIDDEN]" },
        headers: req.headers
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        debugLog("OTP_VERIFY - Validation Errors", errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, otp } = req.body;
      const userRepository = dbConnection.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
        debugLog("OTP_VERIFY - Invalid Request", {
          userExists: !!user,
          hasResetToken: !!(user?.resetPasswordToken),
          hasExpiration: !!(user?.resetPasswordExpires)
        });
        return res.status(400).json({ 
          success: false,
          message: "Invalid or expired OTP" 
        });
      }

      if (new Date() > user.resetPasswordExpires) {
        debugLog("OTP_VERIFY - OTP Expired", {
          userId: user.id,
          expiresAt: user.resetPasswordExpires,
          currentTime: new Date()
        });
        return res.status(400).json({ 
          success: false,
          message: "OTP has expired" 
        });
      }

      const isValidOtp = await bcrypt.compare(otp, user.resetPasswordToken);
      if (!isValidOtp) {
        debugLog("OTP_VERIFY - Invalid OTP", { userId: user.id });
        return res.status(400).json({ 
          success: false,
          message: "Invalid OTP" 
        });
      }

      debugLog("OTP_VERIFY - OTP Valid", { userId: user.id });

      // Generate a temporary token for password change authorization
      const resetToken = jwt.sign(
        { userId: user.id, email: user.email, purpose: "password_reset" },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "15m" } // 15 minutes to change password
      );

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        resetToken: resetToken
      });
    } catch (error: any) {
      debugLog("OTP_VERIFY - Error", {
        message: error.message,
        stack: error.stack
      });
      console.error("OTP verification error:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while verifying OTP"
      });
    }
  };

  // NEW ENDPOINT: Change password (separate from OTP verification)
  static changePassword: ExpressHandler = async (req, res) => {
    try {
      debugLog("CHANGE_PASSWORD - Incoming Request", {
        body: { ...req.body, newPassword: "[HIDDEN]", resetToken: "[HIDDEN]" },
        headers: req.headers
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        debugLog("CHANGE_PASSWORD - Validation Errors", errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { resetToken, newPassword } = req.body;
      
      // Verify reset token
      let decodedToken;
      try {
        decodedToken = jwt.verify(resetToken, process.env.JWT_SECRET || "your-secret-key") as any;
        
        if (decodedToken.purpose !== "password_reset") {
          debugLog("CHANGE_PASSWORD - Invalid Token Purpose", { purpose: decodedToken.purpose });
          return res.status(400).json({
            success: false,
            message: "Invalid reset token"
          });
        }
      } catch (tokenError: any) {
        debugLog("CHANGE_PASSWORD - Token Error", {
          message: tokenError.message,
          name: tokenError.name
        });
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset token"
        });
      }

      const userRepository = dbConnection.getRepository(User);
      const user = await userRepository.findOne({ 
        where: { id: decodedToken.userId, email: decodedToken.email } 
      });

      if (!user) {
        debugLog("CHANGE_PASSWORD - User Not Found", { 
          userId: decodedToken.userId,
          email: decodedToken.email 
        });
        return res.status(400).json({
          success: false,
          message: "User not found"
        });
      }

      debugLog("CHANGE_PASSWORD - User Found", { userId: user.id });

      // Update password
      user.password = await bcrypt.hash(newPassword, 12);
      user.isFirstLogin = false;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await userRepository.save(user);

      debugLog("CHANGE_PASSWORD - Password Updated", { userId: user.id });

      return res.status(200).json({
        success: true,
        message: "Password changed successfully"
      });
    } catch (error: any) {
      debugLog("CHANGE_PASSWORD - Error", {
        message: error.message,
        stack: error.stack
      });
      console.error("Password change error:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while changing your password"
      });
    }
  };

  // LEGACY ENDPOINT: Keep for backward compatibility (combines OTP verification and password reset)
  static resetPassword: ExpressHandler = async (req, res) => {
    try {
      debugLog("PASSWORD_RESET - Incoming Request", {
        body: { ...req.body, newPassword: "[HIDDEN]", otp: "[HIDDEN]" },
        headers: req.headers
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        debugLog("PASSWORD_RESET - Validation Errors", errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, otp, newPassword } = req.body;
      const userRepository = dbConnection.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
        debugLog("PASSWORD_RESET - Invalid Request", {
          userExists: !!user,
          hasResetToken: !!(user?.resetPasswordToken),
          hasExpiration: !!(user?.resetPasswordExpires)
        });
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      if (new Date() > user.resetPasswordExpires) {
        debugLog("PASSWORD_RESET - OTP Expired", {
          userId: user.id,
          expiresAt: user.resetPasswordExpires,
          currentTime: new Date()
        });
        return res.status(400).json({ message: "OTP has expired" });
      }

      const isValidOtp = await bcrypt.compare(otp, user.resetPasswordToken);
      if (!isValidOtp) {
        debugLog("PASSWORD_RESET - Invalid OTP", { userId: user.id });
        return res.status(400).json({ message: "Invalid OTP" });
      }

      debugLog("PASSWORD_RESET - OTP Valid", { userId: user.id });

      // Update password
      user.password = await bcrypt.hash(newPassword, 12);
      user.isFirstLogin = false;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await userRepository.save(user);

      debugLog("PASSWORD_RESET - Password Updated", { userId: user.id });

      return res.status(200).json({
        success: true,
        message: "Password reset successfully"
      });
    } catch (error: any) {
      debugLog("PASSWORD_RESET - Error", {
        message: error.message,
        stack: error.stack
      });
      console.error("Password reset error:", error);
      return res.status(500).json({
        message: "An error occurred while resetting your password"
      });
    }
  };
  
  static getAllEmployees: ExpressHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    debugLog("GET_ALL_EMPLOYEES - Incoming Request", {
      headers: req.headers,
      method: req.method,
      url: req.url
    });

    // Initialize database connection if not already initialized
    if (!dbConnection.isInitialized) {
      debugLog("GET_ALL_EMPLOYEES - Database Connection", "Initializing database connection");
      await dbConnection.initialize();
    }

    const userRepository = dbConnection.getRepository(User);

    debugLog("GET_ALL_EMPLOYEES - Fetching Employees", "Querying database for all employees");

    // Get all employees (excluding admins)
    const employees = await userRepository.find({
      where: { role: UserRole.EMPLOYEE },
      select: [
        "id",
        "username", 
        "email",
        "firstName",
        "lastName",
        "telephone",
        "role",
        "isVerified",
        "isFirstLogin",
        "isActive",
        "lastLoginAt",
        "createdAt",
        "updatedAt"
      ],
      order: {
        createdAt: "DESC"
      }
    });

    debugLog("GET_ALL_EMPLOYEES - Employees Found", {
      count: employees.length,
      employees: employees.map(emp => ({
        id: emp.id,
        email: emp.email,
        firstName: emp.firstName,
        lastName: emp.lastName,
        isActive: emp.isActive
      }))
    });

    const responseData = {
      success: true,
      message: "Employees retrieved successfully",
      data: {
        employees,
        total: employees.length
      }
    };

    debugLog("GET_ALL_EMPLOYEES - Success Response", {
      totalEmployees: employees.length,
      responseStructure: Object.keys(responseData)
    });

    return res.status(200).json(responseData);

  } catch (error: any) {
    debugLog("GET_ALL_EMPLOYEES - Error", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });

    console.error("Get all employees error:", error);
    
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching employees",
      error: process.env.NODE_ENV === "development" ? {
        message: error.message,
        code: error.code
      } : undefined
    });
  }
};
}