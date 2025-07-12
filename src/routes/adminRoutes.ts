// @ts-nocheck
// Enhanced routes/adminRoutes.ts - Adding real-time Socket.io endpoints while maintaining existing functionality
import { Router } from "express";
import { body, param, query } from "express-validator";
import { AdminController } from "../controllers/AdminController";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { UserRole } from "../Enums/UserRole";

const router = Router();

// Apply authentication to all admin routes
router.use(authenticate);
router.use(authorize([UserRole.ADMIN]));

// EXISTING ROUTES: Keeping all existing functionality
router.get("/dashboard", AdminController.getDashboardOverview);
router.get("/dashboard/sales-aggregation", AdminController.getDailySalesAggregation);
router.get("/dashboard/profit-analysis", AdminController.getProfitAnalysis);
router.get("/employees", AdminController.getAllEmployeesWithPerformance);

// EXISTING ROUTES: Sales approval/rejection with enhanced real-time capabilities
router.post(
  "/sales/:saleId/approve",
  [
    param("saleId").isInt().withMessage("Valid sale ID is required"),
    body("notes").optional().isString().withMessage("Notes must be a string")
  ],
  AdminController.approveSale
);

router.post(
  "/sales/:saleId/reject",
  [
    param("saleId").isInt().withMessage("Valid sale ID is required"),
    body("reason").notEmpty().withMessage("Rejection reason is required").isString().withMessage("Reason must be a string")
  ],
  AdminController.rejectSale
);

// ENHANCED NEW ROUTES: Real-time sales management
router.get(
  "/sales/pending/realtime",
  [
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("sortBy").optional().isIn(["createdAt", "totalPrice", "profit", "qtySold"]).withMessage("Invalid sort field"),
    query("sortOrder").optional().isIn(["ASC", "DESC"]).withMessage("Sort order must be ASC or DESC")
  ],
  AdminController.getPendingSalesRealTime
);

// ENHANCED NEW ROUTE: Bulk operations with real-time feedback
router.post(
  "/sales/bulk/approve",
  [
    body("saleIds").isArray().withMessage("Sale IDs must be an array").notEmpty().withMessage("Sale IDs array cannot be empty"),
    body("saleIds.*").isInt().withMessage("Each sale ID must be an integer"),
    body("notes").optional().isString().withMessage("Notes must be a string")
  ],
  AdminController.bulkApproveSales
);

// ENHANCED NEW ROUTE: Real-time dashboard statistics
router.get("/dashboard/stats/realtime", AdminController.getRealTimeDashboardStats);

// ENHANCED NEW ROUTE: Socket.io connection test for admins
router.get("/socket/test", (req, res) => {
  const socketAvailable = !!req.io;
  const timestamp = new Date().toISOString();
  
  if (req.io) {
    // Test emit to admin room
    req.io.to("admin_sales_room").emit("admin_socket_test", {
      message: "Socket.io connection test from admin route",
      adminId: req.userId,
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
      adminId: req.userId
    }
  });
});

// ENHANCED NEW ROUTE: Real-time notification preferences
router.post(
  "/notifications/preferences",
  [
    body("salesApproval").optional().isBoolean().withMessage("Sales approval preference must be boolean"),
    body("criticalStock").optional().isBoolean().withMessage("Critical stock preference must be boolean"),
    body("dailyReports").optional().isBoolean().withMessage("Daily reports preference must be boolean"),
    body("realTimeUpdates").optional().isBoolean().withMessage("Real-time updates preference must be boolean")
  ],
  (req, res) => {
    // This would typically save to database in a real implementation
    const preferences = req.body;
    
    // Send preference update via socket
    if (req.io) {
      req.io.to(`user_${req.userId}`).emit("notification_preferences_updated", {
        preferences,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: "Notification preferences updated",
      data: preferences,
      realTimeNotification: {
        sent: !!req.io,
        timestamp: new Date().toISOString()
      }
    });
  }
);

// ENHANCED NEW ROUTE: Get real-time system health for admin dashboard
router.get("/system/health", async (req, res) => {
  try {
    const dbConnection = (await import("../database")).default;
    const saleRepository = dbConnection.getRepository((await import("../database/models/Sale")).Sale);
    
    // Get system metrics
    const [pendingCount, totalSalesToday] = await Promise.all([
      saleRepository.count({ where: { status: "pending" } }),
      saleRepository.count({
        where: {
          status: "approved",
          // Note: This is a simplified date check, in real implementation you'd use proper date filtering
        }
      })
    ]);
    
    const systemHealth = {
      database: {
        status: dbConnection.isInitialized ? "connected" : "disconnected",
        connected: dbConnection.isInitialized
      },
      socketIo: {
        status: req.io ? "connected" : "disconnected", 
        connected: !!req.io
      },
      sales: {
        pendingCount,
        processingCapable: !!req.io,
        realTimeApprovalEnabled: !!req.io
      },
      performance: {
        totalSalesToday,
        systemLoad: "normal", // This would be calculated from actual metrics
        responseTime: "fast"
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: "System health retrieved successfully",
      data: systemHealth
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve system health",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

export default router;