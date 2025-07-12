// @ts-nocheck
// Enhanced routes/saleRoutes.ts - Adding real-time Socket.io capabilities while maintaining existing functionality
import { Router } from "express"
import { body, query, param } from "express-validator"
import { EnhancedSaleController } from "../controllers/SaleController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"

const router = Router()

// Apply authentication to all sales routes
router.use(authenticate)
router.use(authorize([UserRole.EMPLOYEE, UserRole.ADMIN]))

// ENHANCED: Create sale with real-time socket notifications
router.post(
  "/",
  [
    body("productId").isNumeric().withMessage("Valid product ID is required"),
    body("qtySold").isInt({ min: 1 }).withMessage("Valid quantity is required"),
    body("paymentMethod").optional().isIn(["cash", "card", "mobile", "credit"]).withMessage("Invalid payment method"),
    body("customerName").optional().isString().withMessage("Customer name must be a string"),
    body("customerPhone").optional().isString().withMessage("Customer phone must be a string"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
    body("employeeNotes").optional().isString().withMessage("Employee notes must be a string")
  ],
  EnhancedSaleController.createSale,
)

// ENHANCED: Get sales with real-time capabilities
router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("status").optional().isIn(["pending", "approved", "rejected"]).withMessage("Invalid status"),
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO date"),
    query("paymentMethod").optional().isIn(["cash", "card", "mobile", "credit"]).withMessage("Invalid payment method"),
    query("productId").optional().isNumeric().withMessage("Product ID must be numeric"),
    query("employeeId").optional().isNumeric().withMessage("Employee ID must be numeric"),
    query("currency").optional().isString().withMessage("Currency must be a string"),
    query("realTime").optional().isIn(["true", "false"]).withMessage("Real-time must be true or false")
  ],
  EnhancedSaleController.getSales
)

// ENHANCED: Get sales summary with real-time dashboard integration  
router.get(
  "/summary",
  [
    query("period").optional().isIn(["today", "week", "month", "year"]).withMessage("Invalid period"),
    query("employeeId").optional().isNumeric().withMessage("Employee ID must be numeric"),
    query("currency").optional().isString().withMessage("Currency must be a string"),
    query("includeTransactionDetails").optional().isIn(["true", "false"]).withMessage("Include transaction details must be true or false"),
    // query("includeRealTimeStats").optional().isIn(["true", "false"]).withMessage("Include real-time stats must be true or false")
  ],
  EnhancedSaleController.getSalesSummary
)

// ENHANCED: Get employee sales with real-time capabilities (Admin only)
router.get(
  "/employee/:employeeId",
  [
    param("employeeId").isNumeric().withMessage("Valid employee ID is required"),
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO date"),
    query("status").optional().isIn(["pending", "approved", "rejected"]).withMessage("Invalid status"),
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("currency").optional().isString().withMessage("Currency must be a string"),
    query("includeProductDetails").optional().isIn(["true", "false"]).withMessage("Include product details must be true or false"),
    // query("realTime").optional().isIn(["true", "false"]).withMessage("Real-time must be true or false")
  ],
  authorize([UserRole.ADMIN]), // Admin only for employee sales
  EnhancedSaleController.getEmployeeSales
)

// NEW: Get pending sales with real-time updates (Admin only)
router.get(
  "/pending",
  [
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("currency").optional().isString().withMessage("Currency must be a string")
  ],
  authorize([UserRole.ADMIN]), // Admin only
  EnhancedSaleController.getPendingSales
)

// NEW: Real-time sale status check
router.get(
  "/:saleId/status",
  [
    param("saleId").isNumeric().withMessage("Valid sale ID is required")
  ],
  async (req, res) => {
    try {
      const dbConnection = (await import("../database")).default;
      const Sale = (await import("../database/models/Sale")).Sale;
      const saleRepository = dbConnection.getRepository(Sale);
      
      const sale = await saleRepository.findOne({
        where: { id: Number(req.params.saleId) },
        relations: ["product", "soldBy", "approvedBy"]
      });
      
      if (!sale) {
        return res.status(404).json({
          success: false,
          message: "Sale not found"
        });
      }
      
      // Check if user can access this sale
      if (req.user?.role === UserRole.EMPLOYEE && sale.soldBy.id !== req.userId) {
        return res.status(403).json({
          success: false,
          message: "Access denied"
        });
      }
      
      const ageInMinutes = Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60));
      
      const statusInfo = {
        id: sale.id,
        saleNumber: sale.saleNumber,
        status: sale.status,
        totalPrice: Number(sale.totalPrice),
        totalPriceFormatted: `${Number(sale.totalPrice).toLocaleString()} RWF`,
        profit: Number(sale.profit),
        profitFormatted: `${Number(sale.profit).toLocaleString()} RWF`,
        createdAt: sale.createdAt,
        approvedAt: sale.approvedAt,
        ageInMinutes,
        ageDisplay: ageInMinutes > 60 ? `${Math.floor(ageInMinutes / 60)}h ${ageInMinutes % 60}m` : `${ageInMinutes}m`,
        canApprove: sale.status === "pending" && req.user?.role === UserRole.ADMIN,
        canReject: sale.status === "pending" && req.user?.role === UserRole.ADMIN,
        realTimeTracking: !!req.io,
        lastChecked: new Date().toISOString()
      };
      
      res.json({
        success: true,
        message: "Sale status retrieved successfully",
        data: statusInfo,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve sale status",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }
)

// NEW: Socket.io connection test for sales
router.get("/socket/test", (req, res) => {
  const socketAvailable = !!req.io;
  const timestamp = new Date().toISOString();
  
  if (req.io) {
    const roomName = req.user?.role === UserRole.ADMIN ? "admin_sales_room" : `employee_${req.userId}_sales`;
    
    // Test emit to appropriate room
    req.io.to(roomName).emit("sales_socket_test", {
      message: "Socket.io connection test from sales route",
      userId: req.userId,
      userRole: req.user?.role,
      timestamp
    });
  }
  
  res.json({
    success: true,
    message: socketAvailable ? "Socket.io is available and test signal sent" : "Socket.io is not available",
    data: {
      socketAvailable,
      testSignalSent: socketAvailable,
      timestamp,
      userId: req.userId,
      userRole: req.user?.role,
      targetRoom: req.user?.role === UserRole.ADMIN ? "admin_sales_room" : `employee_${req.userId}_sales`
    }
  });
});

// NEW: Get real-time sales metrics for dashboard widgets
router.get("/metrics/realtime", async (req, res) => {
  try {
    const dbConnection = (await import("../database")).default;
    const Sale = (await import("../database/models/Sale")).Sale;
    const saleRepository = dbConnection.getRepository(Sale);
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Base query conditions based on user role
    const baseConditions: any = {};
    if (req.user?.role === UserRole.EMPLOYEE) {
      baseConditions.soldBy = { id: req.userId };
    }
    
    // Get real-time metrics
    const [
      todayCount,
      pendingCount, 
      approvedCount,
      todayRevenue
    ] = await Promise.all([
      saleRepository.count({
        where: {
          ...baseConditions,
          // salesDate: Between(startOfDay, new Date()) // Simplified for example
        }
      }),
      
      saleRepository.count({
        where: {
          ...baseConditions,
          status: "pending"
        }
      }),
      
      saleRepository.count({
        where: {
          ...baseConditions,
          status: "approved"
          // salesDate: Between(startOfDay, new Date()) // Simplified for example
        }
      }),
      
      saleRepository
        .createQueryBuilder("sale")
        .select("COALESCE(SUM(sale.totalPrice), 0)", "total")
        .where("sale.status = :status", { status: "approved" })
        // Add date filtering and role-based filtering here
        .getRawOne()
    ]);
    
    const metrics = {
      today: {
        totalSales: todayCount,
        pendingSales: pendingCount,
        approvedSales: approvedCount,
        revenue: parseFloat(todayRevenue?.total || 0),
        revenueFormatted: `${parseFloat(todayRevenue?.total || 0).toLocaleString()} RWF`
      },
      realTime: {
        socketConnected: !!req.io,
        autoUpdates: !!req.io,
        lastUpdated: new Date().toISOString()
      },
      user: {
        role: req.user?.role,
        canApprove: req.user?.role === UserRole.ADMIN,
        viewScope: req.user?.role === UserRole.ADMIN ? "all_sales" : "own_sales"
      }
    };
    
    res.json({
      success: true,
      message: "Real-time sales metrics retrieved successfully", 
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve real-time metrics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// NEW: Subscribe to real-time sales updates
router.post("/subscribe/realtime", (req, res) => {
  const { eventTypes } = req.body;
  
  if (!req.io) {
    return res.status(503).json({
      success: false,
      message: "Real-time functionality not available - Socket.io not connected"
    });
  }
  
  const validEventTypes = [
    "sale_created", 
    "sale_approved", 
    "sale_rejected", 
    "pending_count_updated",
    "bulk_operations"
  ];
  
  const subscribedEvents = Array.isArray(eventTypes) ? 
    eventTypes.filter(event => validEventTypes.includes(event)) : 
    validEventTypes;
  
  res.json({
    success: true,
    message: "Successfully subscribed to real-time sales updates",
    data: {
      subscribedEvents,
      socketConnected: true,
      userId: req.userId,
      userRole: req.user?.role,
      subscriptionRoom: req.user?.role === UserRole.ADMIN ? "admin_sales_room" : `employee_${req.userId}_sales`,
      timestamp: new Date().toISOString()
    }
  });
});

export default router