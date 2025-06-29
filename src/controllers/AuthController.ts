import type { Request, Response, NextFunction } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { validationResult } from "express-validator"
import { User } from "../database/models/User"
import { UserRole } from "../Enums/UserRole"
import dbConnection from "../database/index"

type ExpressHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>

// Helper function to exclude password from user object
const excludePassword = (user: User) => {
  const { password, ...userWithoutPassword } = user
  return userWithoutPassword
}

export class AuthController {
  // Register a new user
  static register: ExpressHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() })
        return
      }

      // Initialize database connection if not already initialized
      if (!dbConnection.isInitialized) {
        await dbConnection.initialize()
      }

      const userRepository = dbConnection.getRepository(User)

      // Extract user data from request body (now including password)
      const { lastName, firstName, telephone, email, password, role = UserRole.EMPLOYEE } = req.body

      // Check if trying to register as admin when admin already exists
      if (role === UserRole.ADMIN) {
        const existingAdmin = await userRepository.findOne({
          where: { role: UserRole.ADMIN },
        })

        if (existingAdmin) {
          res.status(400).json({
            message: "Admin user already exists. Only one admin is allowed.",
          })
          return
        }
      }

      // Check if user with email already exists
      const existingUser = await userRepository.findOne({
        where: { email },
      })

      if (existingUser) {
        res.status(400).json({
          message: "Email already exists",
        })
        return
      }

      // Generate username
      const baseUsername = `${firstName} ${lastName}`;
      let username = baseUsername;
      let counter = 1;
      while (await userRepository.findOne({ where: { username } })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      // Hash the provided password
      const hashedPassword = await bcrypt.hash(password, 12)

      // Create new user
      const user = userRepository.create({
        username,
        email,
        password: hashedPassword,
        telephone,
        firstName,
        lastName,
        role,
        isVerified: false,
        isFirstLogin: true,
        is2FAEnabled: false,
        otpAttempts: 0,
      })

      await userRepository.save(user)

      // Return success response
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: excludePassword(user),
        },
      })
    } catch (error: any) {
      console.error("Registration error:", error)
      res.status(500).json({
        message: "An error occurred while registering the user",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    }
  }

  // User login (updated to use email instead of username)
  static login: ExpressHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() })
        return
      }

      // Initialize database connection if not already initialized
      if (!dbConnection.isInitialized) {
        await dbConnection.initialize()
      }

      const userRepository = dbConnection.getRepository(User)
      const { email, password } = req.body

      console.log("Login attempt for email:", email)

      // Find user by email
      const user = await userRepository.findOne({
        where: { email },
      })

      console.log("User found:", user ? "Yes" : "No")

      // Check if user exists
      if (!user) {
        console.log("User not found with email:", email)
        res.status(401).json({
          message: "Invalid credentials",
        })
        return
      }

      // Verify password
      console.log("Comparing password...")
      const isValidPassword = await bcrypt.compare(password, user.password)
      console.log("Password valid:", isValidPassword)

      if (!isValidPassword) {
        console.log("Password comparison failed")
        res.status(401).json({
          message: "Invalid credentials",
        })
        return
      }

      // Update last login time
      user.lastLoginAt = new Date()
      await userRepository.save(user)

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role,
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" },
      )

      // Return success response with token
      res.json({
        message: "Login successful",
        data: {
          user: excludePassword(user),
        },
        token,
      })
    } catch (error:any) {
      console.error("Login error:", error)
      res.status(500).json({
        message: "An error occurred during login",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      })
    }
  }

  // Change password
  static changePassword: ExpressHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() })
        return
      }

      const { currentPassword, newPassword } = req.body
      const userId = req.userId

      if (!userId) {
        res.status(401).json({ message: "Authentication required" })
        return
      }

      const userRepository = dbConnection.getRepository(User)
      const user = await userRepository.findOne({ where: { id: userId } })

      if (!user) {
        res.status(404).json({ message: "User not found" })
        return
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password)
      if (!isValidPassword) {
        res.status(400).json({ message: "Current password is incorrect" })
        return
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12)

      // Update user password
      user.password = hashedPassword
      user.isFirstLogin = false
      await userRepository.save(user)

      res.json({ message: "Password changed successfully" })
    } catch (error) {
      console.error("Change password error:", error)
      next(error)
    }
  }
}