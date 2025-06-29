
// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import { User } from "../database/models/User"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { UserRole } from "../Enums/UserRole"
import { generateRandomString, sendEmail } from "../utils/helper"
import { LoginInstructionsEmailTemplate } from "../utils/emailTemplates"
import { getDateRange } from "../utils/helper"
import bcrypt from "bcryptjs"
import { Between, LessThan } from "typeorm"
import DbConnection from "../database"
import dbConnection from "../database"
export class AdminController {
  // Create a new employee account
  static async createEmployee(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const userRepository = DbConnection.getRepository(User)

      // Extract employee data from request body
      const { firstName, lastName, email, telephone } = req.body

      // Check if user with email already exists
      const existingUser = await userRepository.findOne({
        where: { email },
      })

      if (existingUser) {
        return res.status(400).json({
          message: "Email already exists",
        })
      }

      // Generate username based on first and last name
      const baseUsername = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`
      let username = baseUsername
      let counter = 1

      // Ensure username is unique
      while (await userRepository.findOne({ where: { username } })) {
        username = `${baseUsername}${counter}`
        counter++
      }

      // Generate random password and hash it
      const password = generateRandomString(12)
      const hashedPassword = await bcrypt.hash(password, 12)

      // Create new employee user
      const employee = userRepository.create({
        username,
        email,
        password: hashedPassword,
        telephone,
        firstName,
        lastName,
        role: UserRole.EMPLOYEE,
        isVerified: false,
        isFirstLogin: true,
        is2FAEnabled: false,
        otpAttempts: 0,
      })

      await userRepository.save(employee)

      // Send login instructions email
      const emailHtml = LoginInstructionsEmailTemplate(`${firstName} ${lastName}`, username, email, password)

      await sendEmail({
        to: email,
        subject: "Welcome to StockTrack",
        html: emailHtml,
      })

      // Return success response without password
      const { password: _, ...employeeWithoutPassword } = employee
      return res.status(201).json({
        message: "Employee created successfully",
        data: employeeWithoutPassword,
      })
    } catch (error) {
      console.error("Error creating employee:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // List all employees
  static async listEmployees(req: Request, res: Response) {
    try {
      const userRepository = DbConnection.getRepository(User)

      // Find all employees
      const employees = await userRepository.find({
        where: { role: UserRole.EMPLOYEE },
        select: ["id", "username", "email", "firstName", "lastName", "telephone", "createdAt", "isVerified"],
      })

      return res.status(200).json({
        message: "Employees retrieved successfully",
        data: employees,
      })
    } catch (error) {
      console.error("Error listing employees:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Add a new product
  static async addProduct(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const productRepository = DbConnection.getRepository(Product)

      // Extract product data from request body
      const { name, category, price, costPrice, qtyInStock, description, sku } = req.body

      // Check if product with SKU already exists
      if (sku) {
        const existingProduct = await productRepository.findOne({
          where: { sku },
        })

        if (existingProduct) {
          return res.status(400).json({
            message: "Product with this SKU already exists",
          })
        }
      }

      // Create new product
      const product = productRepository.create({
        name,
        category,
        price,
        costPrice,
        qtyInStock,
        description,
        sku,
      })

      await productRepository.save(product)

      return res.status(201).json({
        message: "Product added successfully",
        data: product,
      })
    } catch (error) {
      console.error("Error adding product:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Delete a product
  static async deleteProduct(req: Request, res: Response) {
    try {
      const productRepository = DbConnection.getRepository(Product)
      const saleRepository = DbConnection.getRepository(Sale)

      const productId = Number.parseInt(req.params.id)

      // Check if product exists
      const product = await productRepository.findOne({
        where: { id: productId },
      })

      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      // Check if product has associated sales
      const sales = await saleRepository.find({
        where: { product: { id: productId } },
      })

      if (sales.length > 0) {
        return res.status(400).json({
          message: "Cannot delete product with associated sales",
          salesCount: sales.length,
        })
      }

      // Delete product
      await productRepository.remove(product)

      return res.status(200).json({
        message: "Product deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting product:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // View pending sales
  static async viewPendingSales(req: Request, res: Response) {
    try {
      const saleRepository = DbConnection.getRepository(Sale)

      // Find all pending sales with related product and employee info
      const pendingSales = await saleRepository.find({
        where: { status: "pending" },
        relations: ["product", "soldBy"],
        order: { salesDate: "DESC" },
      })

      return res.status(200).json({
        message: "Pending sales retrieved successfully",
        data: pendingSales,
      })
    } catch (error) {
      console.error("Error viewing pending sales:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Approve a sale
  static async approveSale(req: Request, res: Response) {
    try {
      const saleRepository = DbConnection.getRepository(Sale)
      const productRepository = DbConnection.getRepository(Product)

      const saleId = Number.parseInt(req.params.id)

      // Find the sale with related product
      const sale = await saleRepository.findOne({
        where: { id: saleId },
        relations: ["product"],
      })

      if (!sale) {
        return res.status(404).json({ message: "Sale not found" })
      }

      if (sale.status !== "pending") {
        return res.status(400).json({
          message: `Sale is already ${sale.status}`,
        })
      }

      // Update sale status and set approver
      sale.status = "approved"
      sale.approvedBy = req.user

      await saleRepository.save(sale)

      return res.status(200).json({
        message: "Sale approved successfully",
        data: sale,
      })
    } catch (error) {
      console.error("Error approving sale:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Generate daily report
  static async dailyReport(req: Request, res: Response) {
    try {
      const saleRepository = DbConnection.getRepository(Sale)
      const productRepository = DbConnection.getRepository(Product)

      // Get date range for today
      const { startDate, endDate } = getDateRange("daily")

      // Get all approved sales for today
      const sales = await saleRepository.find({
        where: {
          status: "approved",
          salesDate: Between(startDate, endDate),
        },
        relations: ["product", "soldBy", "approvedBy"],
      })

      // Calculate total sales and profit
      const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)

      // Get low stock products (less than 10 items)
      const lowStockProducts = await productRepository.find({
        where: { qtyInStock: LessThan(10) },
      })

      return res.status(200).json({
        message: "Daily report generated successfully",
        data: {
          date: new Date().toISOString().split("T")[0],
          salesCount: sales.length,
          totalSales,
          totalProfit,
          sales,
          lowStockProducts,
          lowStockCount: lowStockProducts.length,
        },
      })
    } catch (error) {
      console.error("Error generating daily report:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Generate weekly report
  static async weeklyReport(req: Request, res: Response) {
    try {
      const saleRepository = DbConnection.getRepository(Sale)

      // Get date range for the past week
      const { startDate, endDate } = getDateRange("weekly")

      // Get all approved sales for the past week
      const sales = await saleRepository.find({
        where: {
          status: "approved",
          salesDate: Between(startDate, endDate),
        },
        relations: ["product", "soldBy", "approvedBy"],
      })

      // Group sales by day
      const salesByDay = sales.reduce((acc, sale) => {
        const day = new Date(sale.salesDate).toISOString().split("T")[0]
        if (!acc[day]) {
          acc[day] = {
            date: day,
            salesCount: 0,
            totalSales: 0,
            totalProfit: 0,
          }
        }
        acc[day].salesCount += 1
        acc[day].totalSales += Number(sale.totalPrice)
        acc[day].totalProfit += Number(sale.profit)
        return acc
      }, {})

      // Calculate overall totals
      const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)

      return res.status(200).json({
        message: "Weekly report generated successfully",
        data: {
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
          salesCount: sales.length,
          totalSales,
          totalProfit,
          dailyBreakdown: Object.values(salesByDay),
        },
      })
    } catch (error) {
      console.error("Error generating weekly report:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

    static async getAllSales(req: Request, res: Response) {
    try {
      const saleRepository = DbConnection.getRepository(Sale)
      const { status, startDate, endDate, productId, soldById } = req.query

      // Build query conditions
      const queryConditions: any = {}

      if (status) {
        queryConditions.status = status
      }

      if (startDate && endDate) {
        queryConditions.salesDate = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string),
        }
      }

      if (productId) {
        queryConditions.product = { id: Number(productId) }
      }

      if (soldById) {
        queryConditions.soldBy = { id: Number(soldById) }
      }

      const sales = await saleRepository.find({
        where: queryConditions,
        relations: ["product", "soldBy", "approvedBy"],
        order: { salesDate: "DESC" },
      })

      return res.status(200).json({
        message: "Sales retrieved successfully",
        count: sales.length,
        data: sales,
      })
    } catch (error) {
      console.error("Error fetching all sales:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Get pending sales for approval
  static async getPendingSales(req: Request, res: Response) {
    try {
      const saleRepository = dbConnection.getRepository(Sale)

      const pendingSales = await saleRepository.find({
        where: { status: "pending" },
        relations: ["product", "soldBy"],
        order: { salesDate: "DESC" },
      })

      return res.status(200).json({
        message: "Pending sales retrieved successfully",
        count: pendingSales.length,
        data: pendingSales,
      })
    } catch (error) {
      console.error("Error fetching pending sales:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }


  // Reject a sale
  static async rejectSale(req: Request, res: Response) {
    try {
      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)
      const saleId = Number.parseInt(req.params.id)

      const sale = await saleRepository.findOne({
        where: { id: saleId },
        relations: ["product", "soldBy"],
      })

      if (!sale) {
        return res.status(404).json({ message: "Sale not found" })
      }

      if (sale.status !== "pending") {
        return res.status(400).json({
          message: `Sale is already ${sale.status}`,
        })
      }

      // Restore stock quantity since sale is rejected
      const product = sale.product
      product.qtyInStock += sale.qtySold
      await productRepository.save(product)

      // Update sale status
      sale.status = "rejected"
      sale.approvedBy = req.user

      await saleRepository.save(sale)

      return res.status(200).json({
        message: "Sale rejected successfully and stock restored",
        data: sale,
      })
    } catch (error) {
      console.error("Error rejecting sale:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Get all employees
  static async getAllEmployees(req: Request, res: Response) {
    try {
      const userRepository = dbConnection.getRepository(User)

      const employees = await userRepository.find({
        where: { role: "employee" },
        select: ["id", "firstName", "lastName", "email", "telephone", "isVerified", "createdAt"],
        order: { createdAt: "DESC" },
      })

      return res.status(200).json({
        message: "Employees retrieved successfully",
        count: employees.length,
        data: employees,
      })
    } catch (error) {
      console.error("Error fetching employees:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }
}
