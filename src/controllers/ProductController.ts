// @ts-nocheck
import type { Request, Response } from "express"
import { validationResult } from "express-validator"
import { MoreThan, MoreThanOrEqual, LessThanOrEqual } from "typeorm"
import dbConnection from "../database"
import { Product } from "../database/models/Product"
import { Category } from "../database/models/Category"
import { StockMovement } from "../database/models/StockMovement"
import { Sale } from "../database/models/Sale"
import { UserRole } from "../Enums/UserRole"

// Debug utility function
const debugLog = (context: string, data: any) => {
  console.log(`\n=== DEBUG: ${context} ===`)
  console.log(JSON.stringify(data, null, 2))
  console.log(`=== END DEBUG: ${context} ===\n`)
}

export class EnhancedProductController {
  // ✅ Enhanced: Create product (ADMIN ONLY)
  static async createProduct(req: Request, res: Response) {
    try {
      debugLog("CREATE_PRODUCT - Request", {
        body: req.body,
        userId: req.userId,
        userRole: req.user?.role,
      })

      // ✅ FIXED: Only admins can create products
      if (req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "Only administrators can create products",
        })
      }

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const productRepository = dbConnection.getRepository(Product)
      const categoryRepository = dbConnection.getRepository(Category)
      const stockMovementRepository = dbConnection.getRepository(StockMovement)

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
        minStockLevel = 10,
      } = req.body

      // Check if category exists
      const category = await categoryRepository.findOne({
        where: { id: categoryId },
      })

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        })
      }

      // Check if product type exists in category
      const productType = category.productTypes.find((pt) => pt.id === productTypeId)
      if (!productType) {
        return res.status(404).json({
          success: false,
          message: "Product type not found in this category",
        })
      }

      // Check if product with SKU already exists
      if (sku) {
        const existingProduct = await productRepository.findOne({
          where: { sku },
        })
        if (existingProduct) {
          return res.status(400).json({
            success: false,
            message: "Product with this SKU already exists",
          })
        }
      }

      const createdBy = req.user

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
        minStockLevel,
        createdBy,
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
        relations: ["category", "createdBy"],
      })

      debugLog("CREATE_PRODUCT - Success", {
        productId: savedProduct?.id,
        productName: savedProduct?.name,
        createdBy: savedProduct?.createdBy.id,
      })

      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: savedProduct,
      })
    } catch (error) {
      debugLog("CREATE_PRODUCT - Error", error)
      console.error("Error creating product:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  }
  
 static async getProductDetails(req: Request, res: Response) {
    try {
      const productId = Number(req.params.id);
      const productRepository = dbConnection.getRepository(Product);

      const product = await productRepository.findOne({
        where: { id: productId },
        relations: [
          "category",
          "createdBy",
          "sales",
          "stockMovements",
        ],
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Optionally, you can format/aggregate related data here

      return res.status(200).json({
        success: true,
        message: "Product details retrieved successfully",
        data: product,
      });
    } catch (error) {
      console.error("Get product details error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch product details",
      });
    }
  }
  // ✅ Enhanced: List products with role-based filtering
  static async listProducts(req: Request, res: Response) {
    try {
      debugLog("LIST_PRODUCTS - Request", {
        query: req.query,
        userId: req.userId,
        userRole: req.user?.role,
      })

      const productRepository = dbConnection.getRepository(Product)
      const { categoryId, productTypeId, inStock, minPrice, maxPrice, size, color, search, createdBy } = req.query

      // Build query conditions
      const queryConditions: any = {}

      // ✅ FIXED: Employees can see ALL products, not just their own
      // Only filter by createdBy if specifically requested by admin
      if (createdBy && req.user?.role === UserRole.ADMIN) {
        queryConditions.createdBy = { id: createdBy }
      }

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
        relations: ["category", "createdBy"],
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
        createdByName: `${product.createdBy.firstName} ${product.createdBy.lastName}`,
        isLowStock: product.qtyInStock <= product.minStockLevel,
      }))

      debugLog("LIST_PRODUCTS - Result", {
        productsCount: transformedProducts.length,
        userRole: req.user?.role,
        showingAllProducts: true,
      })

      return res.status(200).json({
        success: true,
        message: "Products retrieved successfully",
        count: transformedProducts.length,
        data: transformedProducts,
      })
    } catch (error) {
      debugLog("LIST_PRODUCTS - Error", error)
      console.error("Error listing products:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  }

  // Get products by specific employee (Admin only)
  static async getEmployeeProducts(req: Request, res: Response) {
    try {
      // ✅ Fix 5: Role-based authorization check
      if (req.user?.role !== UserRole.ADMIN) {
        return res.status(403).json({
          success: false,
          message: "Only admins can access employee products",
        })
      }

      const { employeeId } = req.params
      const productRepository = dbConnection.getRepository(Product)

      const products = await productRepository.find({
        where: { createdBy: { id: Number(employeeId) } },
        relations: ["category", "createdBy"],
        order: { createdAt: "DESC" },
      })

      // Calculate summary statistics
      const summary = {
        totalProducts: products.length,
        totalValue: products.reduce((sum, p) => sum + p.price * p.qtyInStock, 0),
        totalCostValue: products.reduce((sum, p) => sum + p.costPrice * p.qtyInStock, 0),
        lowStockProducts: products.filter((p) => p.qtyInStock <= p.minStockLevel).length,
        outOfStockProducts: products.filter((p) => p.qtyInStock === 0).length,
      }

      return res.json({
        success: true,
        message: "Employee products retrieved successfully",
        data: {
          products,
          summary,
        },
      })
    } catch (error) {
      console.error("Get employee products error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch employee products",
      })
    }
  }

  // Enhanced product profit analysis
  static async getProductProfitAnalysis(req: Request, res: Response) {
    try {
      const productId = Number.parseInt(req.params.id)
      const { period = "30" } = req.query

      const saleRepository = dbConnection.getRepository(Sale)
      const productRepository = dbConnection.getRepository(Product)

      // Check if product exists
      const product = await productRepository.findOne({
        where: { id: productId },
        relations: ["category", "createdBy"],
      })

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        })
      }

      const daysBack = Number.parseInt(period as string)
      const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

      // Get all approved sales for this product
      const sales = await saleRepository.find({
        where: {
          product: { id: productId },
          status: "approved",
          salesDate: MoreThanOrEqual(startDate),
        },
        relations: ["soldBy"],
        order: { salesDate: "DESC" },
      })

      // Calculate metrics
      const totalSales = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0)
      const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0)
      const totalQuantitySold = sales.reduce((sum, sale) => sum + Number(sale.qtySold), 0)

      // Group sales by date for trend analysis
      const dailySales = sales.reduce((acc, sale) => {
        const dateKey = sale.salesDate.toISOString().split("T")[0]
        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            sales: 0,
            profit: 0,
            quantity: 0,
            transactions: 0,
          }
        }
        acc[dateKey].sales += Number(sale.totalPrice)
        acc[dateKey].profit += Number(sale.profit)
        acc[dateKey].quantity += Number(sale.qtySold)
        acc[dateKey].transactions += 1
        return acc
      }, {})

      // Calculate current inventory value
      const currentInventoryValue = product.qtyInStock * product.costPrice
      const potentialProfit = product.qtyInStock * (product.price - product.costPrice)

      return res.status(200).json({
        success: true,
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
            minStockLevel: product.minStockLevel,
            isLowStock: product.qtyInStock <= product.minStockLevel,
            createdBy: `${product.createdBy.firstName} ${product.createdBy.lastName}`,
          },
          sales: {
            totalSalesCount: sales.length,
            totalQuantitySold,
            totalSalesValue: totalSales,
            totalProfit,
            profitMargin: totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
            avgSaleValue: sales.length > 0 ? totalSales / sales.length : 0,
          },
          inventory: {
            currentStockValue: currentInventoryValue,
            potentialProfit,
            turnoverRate:
              totalQuantitySold > 0 ? (totalQuantitySold / (product.qtyInStock + totalQuantitySold)) * 100 : 0,
          },
          trends: {
            dailySales: Object.values(dailySales),
            period: `${period} days`,
          },
          recentSales: sales.slice(0, 5).map((sale) => ({
            id: sale.id,
            saleNumber: sale.saleNumber,
            qtySold: sale.qtySold,
            totalPrice: sale.totalPrice,
            profit: sale.profit,
            salesDate: sale.salesDate,
            soldBy: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
          })),
        },
      })
    } catch (error) {
      console.error("Error getting product profit analysis:", error)
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  }

  // Get low stock products
  static async getLowStockProducts(req: Request, res: Response) {
    try {
      const productRepository = dbConnection.getRepository(Product)

      const products = await productRepository
        .createQueryBuilder("product")
        .leftJoinAndSelect("product.category", "category")
        .leftJoinAndSelect("product.createdBy", "createdBy")
        .where("product.qtyInStock <= product.minStockLevel")
        .orderBy("product.qtyInStock", "ASC")
        .getMany()

      const summary = {
        totalLowStockProducts: products.length,
        outOfStockProducts: products.filter((p) => p.qtyInStock === 0).length,
        criticalStockProducts: products.filter((p) => p.qtyInStock > 0 && p.qtyInStock <= 5).length,
      }

      return res.json({
        success: true,
        message: "Low stock products retrieved successfully",
        data: {
          products: products.map((product) => ({
            ...product,
            stockStatus: product.qtyInStock === 0 ? "out_of_stock" : product.qtyInStock <= 5 ? "critical" : "low",
            createdByName: `${product.createdBy.firstName} ${product.createdBy.lastName}`,
          })),
          summary,
        },
      })
    } catch (error) {
      console.error("Get low stock products error:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to fetch low stock products",
      })
    }
  }
static async updateProductStock(req: Request, res: Response) {
  const queryRunner = dbConnection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const productId = Number(req.params.id);
    const { type, quantity, reason, costPrice } = req.body;
    const user = req.user;

    // Find product
    const product = await queryRunner.manager.findOne(Product, {
      where: { id: productId },
    });

    if (!product) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check stock availability for outbound movements
    if (type === "out" && product.qtyInStock < quantity) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
        available: product.qtyInStock,
        requested: quantity,
      });
    }

    // Create stock movement record
    const stockMovement = queryRunner.manager.create(StockMovement, {
      product,
      type,
      quantity,
      costPrice: type === "in" ? costPrice || product.costPrice : product.costPrice,
      reason,
      recordedBy: user,
      movementDate: new Date(),
    });

    await queryRunner.manager.save(stockMovement);

    // Update product stock
    const newStock = type === "in" ? product.qtyInStock + quantity : product.qtyInStock - quantity;
    await queryRunner.manager.update(Product, productId, {
      qtyInStock: newStock,
      // Update cost price if it's a stock in with new cost price
      ...(type === "in" && costPrice ? { costPrice } : {}),
    });

    await queryRunner.commitTransaction();

    // Fetch updated product details
    const updatedProduct = await dbConnection.getRepository(Product).findOne({
      where: { id: productId },
      relations: ["category", "stockMovements"],
    });

    return res.status(200).json({
      success: true,
      message: `Stock successfully ${type === 'in' ? 'added to' : 'removed from'} product`,
      data: {
        product: updatedProduct,
        stockMovement,
      },
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("Update product stock error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product stock",
    });
  } finally {
    await queryRunner.release();
  }
}
}
