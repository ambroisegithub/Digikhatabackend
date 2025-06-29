
// @ts-nocheck
import type { Request } from "express"
import type { User } from "../database/models/User"

// Extend Express Request interface
export interface AuthenticatedRequest extends Request {
  user?: User
  userId?: number
  userRole?: string
}

// Sale status type
export type SaleStatus = "pending" | "approved" | "rejected"

// Report period type
export type ReportPeriod = "daily" | "weekly" | "monthly"

// Email options type
export interface EmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}
