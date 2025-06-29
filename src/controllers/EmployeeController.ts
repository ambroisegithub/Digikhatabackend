import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../database"
import { Product } from "../database/models/Product"
import { Sale } from "../database/models/Sale"
import { User } from "../database/models/User"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { MoreThan, Between } from "typeorm"

export class EmployeeController {
  // Employee login
  static async login(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const userRepository = dbConnection.getRepository(User)
      const { username, password } = req.body

      // Find user by username
      const user = await userRepository.findOne({
        where: { username },
      })

      // Check if user exists
      if (!user) {
        return res.status(401).json({
          message: "Invalid credentials",
        })
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password)
      if (!isValidPassword) {
        return res.status(401).json({
          message: "Invalid credentials",
        })
      }

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
      const { password: _, ...userWithoutPassword } = user
      return res.json({
        message: "Login successful",
        data: {
          user: userWithoutPassword,
        },
        token,
      })
    } catch (error) {
      console.error("Login error:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Sell a product
  static async sellProduct(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { productId, qtySold } = req.body
      const user = req.user

      if (!user) {
        return res.status(401).json({ message: "Authentication required" })
      }

      const productRepository = dbConnection.getRepository(Product)
      const saleRepository = dbConnection.getRepository(Sale)

      // Find product
      const product = await productRepository.findOne({
        where: { id: productId },
      })

      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      // Check if enough stock is available
      if (product.qtyInStock < qtySold) {
        return res.status(400).json({
          message: "Insufficient stock",
          available: product.qtyInStock,
          requested: qtySold,
        })
      }

      // Create sale record
      const sale = saleRepository.create({
        product,
        qtySold,
        soldBy: user,
        salesDate: new Date(),
        totalPrice: product.price * qtySold,
        profit: (product.price - product.costPrice) * qtySold,
        status: "pending",
      })

      // Update product stock
      product.qtyInStock -= qtySold

      // Save changes
      await productRepository.save(product)
      await saleRepository.save(sale)

      return res.status(201).json({
        message: "Sale recorded successfully, awaiting approval",
        data: {
          sale,
          remainingStock: product.qtyInStock,
        },
      })
    } catch (error) {
      console.error("Error selling product:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // List all products
  static async listProducts(req: Request, res: Response) {
    try {
      const productRepository = dbConnection.getRepository(Product)

      // Get query parameters for filtering
      const { category, inStock } = req.query

      // Build query conditions
      const queryConditions: any = {}

      if (category) {
        queryConditions.category = category
      }

      if (inStock === "true") {
        queryConditions.qtyInStock = MoreThan(0)
      }

      // Find products based on conditions
      const products = await productRepository.find({
        where: queryConditions,
        order: { name: "ASC" },
      })

      return res.status(200).json({
        message: "Products retrieved successfully",
        count: products.length,
        data: products,
      })
    } catch (error) {
      console.error("Error listing products:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // View employee's sales
  static async viewMySales(req: Request, res: Response) {
    try {
      const saleRepository = dbConnection.getRepository(Sale)
      const userId = req.userId

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" })
      }

      // Get query parameters for filtering
      const { status, startDate, endDate } = req.query

      // Build query conditions
      const queryConditions: any = {
        soldBy: { id: userId },
      }

      if (status) {
        queryConditions.status = status
      }

      if (startDate && endDate) {
        queryConditions.salesDate = Between(new Date(startDate as string), new Date(endDate as string))
      }

      // Find sales based on conditions
      const sales = await saleRepository.find({
        where: queryConditions,
        relations: ["product", "approvedBy"],
        order: { salesDate: "DESC" },
      })

      return res.status(200).json({
        message: "Sales retrieved successfully",
        count: sales.length,
        data: sales,
      })
    } catch (error) {
      console.error("Error viewing sales:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }
}
