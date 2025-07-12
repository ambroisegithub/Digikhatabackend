// @ts-nocheck
import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import type { UserRole } from "../Enums/UserRole"
import dbConnection from "../database"
import { User } from "../database/models/User"

// Extend the Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: User
      userId?: number
      userRole?: UserRole
    }
  }
}

// Authenticate middleware - verifies JWT token
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" })
    }

    const token = authHeader.split(" ")[1]
    if (!token) {
      return res.status(401).json({ message: "Authentication token missing" })
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key") as any

    // Get user from database
    const userRepository = dbConnection.getRepository(User)
    const user = await userRepository.findOne({ where: { id: decoded.userId } })

    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    // Attach user to request object
    req.user = user
    req.userId = user.id
    req.userRole = user.role

    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: "Invalid token" })
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: "Token expired" })
    }
    console.error("Authentication error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}

// Authorize middleware - checks if user has required role
export const authorize = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.userRole) {
      return res.status(401).json({ message: "Authentication required" })
    }

    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ message: "Forbidden: Insufficient permissions" })
    }

    next()
  }
}
