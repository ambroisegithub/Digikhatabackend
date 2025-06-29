import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import { MoreThan, MoreThanOrEqual, LessThanOrEqual } from "typeorm"
import dbConnection from "../database"
import { Product } from "../database/models/Product"
import { Category } from "../database/models/Category"
import { StockMovement } from "../database/models/StockMovement"
import { Sale } from "../database/models/Sale"

export class ProductController {
  // Create a new product
  static async createProduct(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const productRepository = dbConnection.getRepository(Product)
      const categoryRepository = dbConnection.getRepository(Category)
      const stockMovementRepository = dbConnection.getRepository(StockMovement)

      // Extract product data from request body
      const {
        name,
        categoryId,
        productTypeId,
        price,
        costPrice,
        qtyInStock,
        description,
        sku,
        size,
        color,
        otherAttributes,
      } = req.body

      // Check if category exists
      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({ message: "Category not found" })
      }

      // Check if product type exists in category
      const productType = category.productTypes.find((pt) => pt.id === productTypeId)
      if (!productType) {
        return res.status(404).json({ message: "Product type not found in this category" })
      }

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
        productTypeId,
        productTypeName: productType.name,
        price,
        costPrice,
        qtyInStock,
        description,
        sku,
        size,
        color,
        otherAttributes,
      })

      await productRepository.save(product)

      // Create stock movement record for initial stock
      if (qtyInStock > 0) {
        const stockMovement = stockMovementRepository.create({
          product,
          type: "in",
          quantity: qtyInStock,
          costPrice,
          reason: "Initial stock",
          recordedBy: req.user,
          movementDate: new Date(),
        })

        await stockMovementRepository.save(stockMovement)
      }

      // Return product with category info
      const savedProduct = await productRepository.findOne({
        where: { id: product.id },
        relations: ["category"],
      })

      return res.status(201).json({
        message: "Product created successfully",
        data: savedProduct,
      })
    } catch (error) {
      console.error("Error creating product:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // List products with filtering options
  static async listProducts(req: Request, res: Response) {
    try {
      const productRepository = dbConnection.getRepository(Product)

      // Get query parameters for filtering
      const { categoryId, productTypeId, inStock, minPrice, maxPrice, size, color, search } = req.query

      // Build query conditions
      const queryConditions: any = {}

      if (categoryId) {
        queryConditions.category = { id: categoryId }
      }

      if (productTypeId) {
        queryConditions.productTypeId = productTypeId
      }

      if (inStock === "true") {
        queryConditions.qtyInStock = MoreThan(0)
      }

      if (minPrice) {
        queryConditions.price = MoreThanOrEqual(Number(minPrice))
      }

      if (maxPrice) {
        queryConditions.price = LessThanOrEqual(Number(maxPrice))
      }

      if (size) {
        queryConditions.size = size
      }

      if (color) {
        queryConditions.color = color
      }

      // Find products based on conditions
      let products = await productRepository.find({
        where: queryConditions,
        relations: ["category"],
        order: { name: "ASC" },
      })

      // Apply search filter if provided
      if (search) {
        const searchTerm = search.toString().toLowerCase()
        products = products.filter(
          (product) =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.productTypeName.toLowerCase().includes(searchTerm) ||
            product.category.name.toLowerCase().includes(searchTerm) ||
            (product.sku && product.sku.toLowerCase().includes(searchTerm)),
        )
      }

      // Transform products to include productType object for compatibility
      const transformedProducts = products.map((product) => ({
        ...product,
        productType: {
          id: product.productTypeId,
          name: product.productTypeName,
        },
      }))

      return res.status(200).json({
        message: "Products retrieved successfully",
        count: transformedProducts.length,
        data: transformedProducts,
      })
    } catch (error) {
      console.error("Error listing products:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Get a single product with its details
  static async getProduct(req: Request, res: Response) {
    try {
      const productRepository = dbConnection.getRepository(Product)
      const productId = Number.parseInt(req.params.id)

      // Find product with its related data
      const product = await productRepository.findOne({
        where: { id: productId },
        relations: ["category", "stockMovements"],
      })

      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      // Transform product to include productType object for compatibility
      const transformedProduct = {
        ...product,
        productType: {
          id: product.productTypeId,
          name: product.productTypeName,
        },
      }

      return res.status(200).json({
        message: "Product retrieved successfully",
        data: transformedProduct,
      })
    } catch (error) {
      console.error("Error getting product:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Update a product
  static async updateProduct(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const productRepository = dbConnection.getRepository(Product)
      const categoryRepository = dbConnection.getRepository(Category)
      const productId = Number.parseInt(req.params.id)

      // Check if product exists
      const product = await productRepository.findOne({
        where: { id: productId },
        relations: ["category"],
      })

      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      // Extract update data
      const { name, categoryId, productTypeId, price, costPrice, description, sku, size, color, otherAttributes } =
        req.body

      // Check if category needs to be updated
      if (categoryId && categoryId !== product.category.id) {
        const category = await categoryRepository.findOne({
          where: { id: categoryId },
        })
        if (!category) {
          return res.status(404).json({ message: "Category not found" })
        }

        // Check if product type exists in new category
        if (productTypeId) {
          const productType = category.productTypes.find((pt) => pt.id === productTypeId)
          if (!productType) {
            return res.status(404).json({ message: "Product type not found in this category" })
          }
          product.productTypeId = productTypeId
          product.productTypeName = productType.name
        }

        product.category = category
      } else if (productTypeId && productTypeId !== product.productTypeId) {
        // Update product type within same category
        const productType = product.category.productTypes.find((pt) => pt.id === productTypeId)
        if (!productType) {
          return res.status(404).json({ message: "Product type not found in this category" })
        }
        product.productTypeId = productTypeId
        product.productTypeName = productType.name
      }

      // Check if SKU is being changed and if it's unique
      if (sku && sku !== product.sku) {
        const existingProduct = await productRepository.findOne({
          where: { sku },
        })
        if (existingProduct) {
          return res.status(400).json({
            message: "Another product with this SKU already exists",
          })
        }
      }

      // Update product fields
      product.name = name || product.name
      product.price = price !== undefined ? price : product.price
      product.costPrice = costPrice !== undefined ? costPrice : product.costPrice
      product.description = description !== undefined ? description : product.description
      product.sku = sku !== undefined ? sku : product.sku
      product.size = size !== undefined ? size : product.size
      product.color = color !== undefined ? color : product.color
      product.otherAttributes = otherAttributes !== undefined ? otherAttributes : product.otherAttributes

      await productRepository.save(product)

      // Transform product to include productType object for compatibility
      const transformedProduct = {
        ...product,
        productType: {
          id: product.productTypeId,
          name: product.productTypeName,
        },
      }

      return res.status(200).json({
        message: "Product updated successfully",
        data: transformedProduct,
      })
    } catch (error) {
      console.error("Error updating product:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Update stock quantity
  static async updateStock(req: Request, res: Response) {
    try {
      // Validate request
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const productRepository = dbConnection.getRepository(Product)
      const stockMovementRepository = dbConnection.getRepository(StockMovement)
      const productId = Number.parseInt(req.params.id)

      // Extract stock update data
      const { quantity, type, reason, costPrice } = req.body

      // Check if product exists
      const product = await productRepository.findOne({
        where: { id: productId },
      })

      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      // Validate stock movement type
      if (type !== "in" && type !== "out") {
        return res.status(400).json({ message: "Stock movement type must be 'in' or 'out'" })
      }

      // Validate quantity
      if (quantity <= 0) {
        return res.status(400).json({ message: "Quantity must be greater than 0" })
      }

      // Check if there's enough stock for "out" movement
      if (type === "out" && product.qtyInStock < quantity) {
        return res.status(400).json({
          message: "Insufficient stock",
          available: product.qtyInStock,
          requested: quantity,
        })
      }

      // Update product stock
      if (type === "in") {
        product.qtyInStock += quantity
      } else {
        product.qtyInStock -= quantity
      }

      // If it's a stock in with a new cost price, update the product's cost price
      if (type === "in" && costPrice !== undefined) {
        product.costPrice = costPrice
      }

      // Create stock movement record
      const stockMovement = stockMovementRepository.create({
        product,
        type,
        quantity,
        costPrice: type === "in" ? costPrice : product.costPrice,
        reason,
        recordedBy: req.user,
        movementDate: new Date(),
      })

      // Save changes
      await productRepository.save(product)
      await stockMovementRepository.save(stockMovement)

      return res.status(200).json({
        message: `Stock ${type === "in" ? "added" : "removed"} successfully`,
        data: {
          product,
          stockMovement,
        },
      })
    } catch (error) {
      console.error("Error updating stock:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }

  // Get product profit/loss analysis
  static async getProductProfitAnalysis(req: Request, res: Response) {
    try {
      const productId = Number.parseInt(req.params.id)
      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)

      // Check if product exists
      const product = await productRepository.findOne({
        where: { id: productId },
        relations: ["category"],
      })

      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      // Get all approved sales for this product
      const sales = await saleRepository.find({
        where: {
          product: { id: productId },
          status: "approved",
        },
        order: { salesDate: "DESC" },
      })

      // Calculate total sales and profit
      const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)
      const totalQuantitySold = sales.reduce((sum, sale) => sum + Number(sale.qtySold), 0)

      // Calculate current inventory value
      const currentInventoryValue = product.qtyInStock * product.costPrice

      return res.status(200).json({
        message: "Product profit analysis retrieved successfully",
        data: {
          product: {
            id: product.id,
            name: product.name,
            productType: product.productTypeName,
            sku: product.sku,
            currentPrice: product.price,
            currentCostPrice: product.costPrice,
            currentStock: product.qtyInStock,
          },
          sales: {
            totalSalesCount: sales.length,
            totalQuantitySold,
            totalSalesValue: totalSales,
            totalProfit,
            profitMargin: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
          },
          inventory: {
            currentStockValue: currentInventoryValue,
            potentialProfit: product.qtyInStock * (product.price - product.costPrice),
          },
          recentSales: sales.slice(0, 5), // Return only the 5 most recent sales
        },
      })
    } catch (error) {
      console.error("Error getting product profit analysis:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  }
}
