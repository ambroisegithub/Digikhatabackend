// @ts-nocheck
import { Router } from "express"
import { body, query } from "express-validator"
import { EmployeeController } from "../controllers/EmployeeController"
import { AuthController } from "../controllers/AuthController"
import { authenticate, authorize } from "../middlewares/authMiddleware"
import { UserRole } from "../Enums/UserRole"

const router = Router()

router.use(authenticate);
router.use(authorize([UserRole.EMPLOYEE, UserRole.ADMIN]));

router.post(
  "/login",
  [
    body("username").notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  EmployeeController.login,
)

router.get("/products", EmployeeController.listAllProducts)

router.post(
  "/sell",
  [
    body("productId").isNumeric().withMessage("Valid product ID is required"),
    body("qtySold").isInt({ min: 1 }).withMessage("Valid quantity is required"),
    body("paymentMethod").optional().isIn(["cash", "card", "mobile", "credit"]).withMessage("Invalid payment method"),
  ],
  EmployeeController.sellProduct,
)

// ENHANCED: Employee dashboard with Socket.io real-time capabilities
router.get(
  "/dashboard", 
  [
    query("realTime").optional().isIn(["true", "false"]).withMessage("Real-time must be true or false"),
    query("currency").optional().isString().withMessage("Currency must be a string"),
    query("includeAlerts").optional().isIn(["true", "false"]).withMessage("Include alerts must be true or false")
  ],
  EmployeeController.getEmployeeDashboardOverview
);

// ENHANCED: Employee sales view with Socket.io real-time capabilities
router.get(
  "/sales", 
  [
    query("status").optional().isIn(["pending", "approved", "rejected"]).withMessage("Invalid status"),
    query("period").optional().isIn(["today", "week", "month", "all"]).withMessage("Invalid period"),
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO date"),
    query("currency").optional().isString().withMessage("Currency must be a string"),
    query("includeRealTimeStatus").optional().isIn(["true", "false"]).withMessage("Include real-time status must be true or false"),
    query("realTime").optional().isIn(["true", "false"]).withMessage("Real-time must be true or false")
  ],
  EmployeeController.viewMySales
)

router.get("/all", AuthController.getAllEmployees)

router.get("/sales/daily-summary", EmployeeController.getDailySalesSummary)

router.get("/performance", EmployeeController.getProductPerformance)

// NEW: Real-time socket connection test for employees
router.get("/socket/test", (req, res) => {
  const socketAvailable = !!req.io;
  const timestamp = new Date().toISOString();
  
  if (req.io && req.userId) {
    const roomName = `employee_${req.userId}_sales`;
    
    // Test emit to employee's room
    req.io.to(roomName).emit("employee_socket_test", {
      message: "Socket.io connection test from employee route",
      userId: req.userId,
      userRole: req.user?.role,
      timestamp,
      features: ["dashboard_updates", "sales_tracking", "approval_notifications"]
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
      targetRoom: `employee_${req.userId}_sales`,
      availableFeatures: socketAvailable ? [
        "real_time_dashboard_updates",
        "sale_status_notifications", 
        "approval_alerts",
        "inventory_warnings",
        "performance_tracking"
      ] : []
    }
  });
});

// NEW: Get real-time dashboard metrics specifically for employees
router.get("/dashboard/metrics/realtime", async (req, res) => {
  try {
    const dbConnection = (await import("../database")).default;
    const Sale = (await import("../database/models/Sale")).Sale;
    const saleRepository = dbConnection.getRepository(Sale);
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Employee-specific metrics
    const baseConditions = { soldBy: { id: req.userId } };
    
    // Get comprehensive employee metrics
    const [
      todayCount,
      todayRevenue,
      todayProfit,
      weeklyCount,
      weeklyRevenue,
      monthlyCount,
      monthlyRevenue,
      pendingCount,
      approvedCount,
      rejectedCount
    ] = await Promise.all([
      // Today's metrics
      saleRepository.count({
        where: {
          ...baseConditions,
          salesDate: { $gte: startOfDay } as any,
          status: "approved"
        }
      }),
      
      saleRepository
        .createQueryBuilder("sale")
        .select("COALESCE(SUM(sale.totalPrice), 0)", "total")
        .where("sale.soldById = :userId", { userId: req.userId })
        .andWhere("sale.status = :status", { status: "approved" })
        .andWhere("DATE(sale.salesDate) = DATE(:today)", { today })
        .getRawOne(),
        
      saleRepository
        .createQueryBuilder("sale")
        .select("COALESCE(SUM(sale.profit), 0)", "total")
        .where("sale.soldById = :userId", { userId: req.userId })
        .andWhere("sale.status = :status", { status: "approved" })
        .andWhere("DATE(sale.salesDate) = DATE(:today)", { today })
        .getRawOne(),
      
      // Weekly metrics
      saleRepository.count({
        where: {
          ...baseConditions,
          salesDate: { $gte: startOfWeek } as any,
          status: "approved"
        }
      }),
      
      saleRepository
        .createQueryBuilder("sale")
        .select("COALESCE(SUM(sale.totalPrice), 0)", "total")
        .where("sale.soldById = :userId", { userId: req.userId })
        .andWhere("sale.status = :status", { status: "approved" })
        .andWhere("sale.salesDate >= :startOfWeek", { startOfWeek })
        .getRawOne(),
      
      // Monthly metrics
      saleRepository.count({
        where: {
          ...baseConditions,
          salesDate: { $gte: startOfMonth } as any,
          status: "approved"
        }
      }),
      
      saleRepository
        .createQueryBuilder("sale")
        .select("COALESCE(SUM(sale.totalPrice), 0)", "total")
        .where("sale.soldById = :userId", { userId: req.userId })
        .andWhere("sale.status = :status", { status: "approved" })
        .andWhere("sale.salesDate >= :startOfMonth", { startOfMonth })
        .getRawOne(),
      
      // Status counts
      saleRepository.count({
        where: { ...baseConditions, status: "pending" }
      }),
      
      saleRepository.count({
        where: { ...baseConditions, status: "approved" }
      }),
      
      saleRepository.count({
        where: { ...baseConditions, status: "rejected" }
      })
    ]);
    
    const metrics = {
      today: {
        transactions: todayCount,
        revenue: parseFloat(todayRevenue?.total || 0),
        revenueFormatted: `${parseFloat(todayRevenue?.total || 0).toLocaleString()} RWF`,
        profit: parseFloat(todayProfit?.total || 0),
        profitFormatted: `${parseFloat(todayProfit?.total || 0).toLocaleString()} RWF`,
        avgTransactionValue: todayCount > 0 ? parseFloat(todayRevenue?.total || 0) / todayCount : 0
      },
      week: {
        transactions: weeklyCount,
        revenue: parseFloat(weeklyRevenue?.total || 0),
        revenueFormatted: `${parseFloat(weeklyRevenue?.total || 0).toLocaleString()} RWF`,
        dailyAverage: {
          transactions: weeklyCount / 7,
          revenue: parseFloat(weeklyRevenue?.total || 0) / 7
        }
      },
      month: {
        transactions: monthlyCount,
        revenue: parseFloat(monthlyRevenue?.total || 0),
        revenueFormatted: `${parseFloat(monthlyRevenue?.total || 0).toLocaleString()} RWF`,
        dailyAverage: {
          transactions: monthlyCount / 30,
          revenue: parseFloat(monthlyRevenue?.total || 0) / 30
        }
      },
      status: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: pendingCount + approvedCount + rejectedCount,
        conversionRate: (pendingCount + approvedCount + rejectedCount) > 0 ? 
          (approvedCount / (pendingCount + approvedCount + rejectedCount)) * 100 : 0
      },
      realTime: {
        socketConnected: !!req.io,
        autoUpdates: !!req.io,
        lastUpdated: new Date().toISOString(),
        room: `employee_${req.userId}_sales`,
        subscriptionStatus: "active"
      },
      alerts: {
        urgentPending: pendingCount > 5,
        lowPerformance: todayCount === 0 && new Date().getHours() > 12, // No sales by afternoon
        needsAttention: pendingCount > 0
      }
    };
    
    // ENHANCED: Emit real-time metrics update if socket is available
    if (req.io && req.userId) {
      req.io.to(`employee_${req.userId}_sales`).emit("dashboard_metrics_realtime", {
        metrics,
        updateType: "requested",
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: "Real-time employee dashboard metrics retrieved successfully", 
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve real-time dashboard metrics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// NEW: Get real-time sales metrics specifically for employee sales view
router.get("/sales/metrics/realtime", async (req, res) => {
  try {
    const dbConnection = (await import("../database")).default;
    const Sale = (await import("../database/models/Sale")).Sale;
    const saleRepository = dbConnection.getRepository(Sale);
    
    const { period = "today", status, currency = "RWF" } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    const baseConditions: any = { 
      soldBy: { id: req.userId },
      salesDate: { $gte: startDate } as any
    };
    
    if (status) {
      baseConditions.status = status;
    }
    
    // Get sales data for metrics
    const sales = await saleRepository.find({
      where: baseConditions,
      relations: ["product", "product.category"]
    });
    
    // Calculate comprehensive metrics
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0);
    const totalProfit = sales.reduce((sum, sale) => sum + Number(sale.profit), 0);
    const approvedSales = sales.filter(s => s.status === "approved");
    const pendingSales = sales.filter(s => s.status === "pending");
    const rejectedSales = sales.filter(s => s.status === "rejected");
    
    // Product breakdown
    const productBreakdown = sales.reduce((acc, sale) => {
      const productName = sale.product.name;
      if (!acc[productName]) {
        acc[productName] = {
          name: productName,
          category: sale.product.category?.name || "Unknown",
          totalSales: 0,
          totalProfit: 0,
          quantity: 0,
          transactions: 0
        };
      }
      
      acc[productName].totalSales += Number(sale.totalPrice);
      acc[productName].totalProfit += Number(sale.profit);
      acc[productName].quantity += Number(sale.qtySold);
      acc[productName].transactions += 1;
      
      return acc;
    }, {});
    
    const metrics = {
      period: period as string,
      periodStart: startDate.toISOString(),
      periodEnd: now.toISOString(),
      currency: currency as string,
      
      // Core metrics
      totalRevenue: totalRevenue,
      totalRevenueFormatted: `${totalRevenue.toLocaleString()} ${currency}`,
      totalProfit: totalProfit,
      totalProfitFormatted: `${totalProfit.toLocaleString()} ${currency}`,
      totalTransactions: sales.length,
      
      // Status breakdown
      statusBreakdown: {
        approved: {
          count: approvedSales.length,
          revenue: approvedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0),
          revenueFormatted: `${approvedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0).toLocaleString()} ${currency}`
        },
        pending: {
          count: pendingSales.length,
          revenue: pendingSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0),
          revenueFormatted: `${pendingSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0).toLocaleString()} ${currency}`,
          urgent: pendingSales.filter(sale => 
            Math.floor((new Date().getTime() - new Date(sale.createdAt).getTime()) / (1000 * 60 * 60)) > 2
          ).length
        },
        rejected: {
          count: rejectedSales.length,
          revenue: rejectedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0),
          revenueFormatted: `${rejectedSales.reduce((sum, sale) => sum + Number(sale.totalPrice), 0).toLocaleString()} ${currency}`
        }
      },
      
      // Performance indicators
      performance: {
        conversionRate: sales.length > 0 ? (approvedSales.length / sales.length) * 100 : 0,
        avgTransactionValue: sales.length > 0 ? totalRevenue / sales.length : 0,
        avgTransactionValueFormatted: `${sales.length > 0 ? (totalRevenue / sales.length).toLocaleString() : 0} ${currency}`,
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        topProduct: Object.values(productBreakdown).sort((a: any, b: any) => b.totalProfit - a.totalProfit)[0] || null
      },
      
      // Product insights
      productInsights: Object.values(productBreakdown)
        .sort((a: any, b: any) => b.totalProfit - a.totalProfit)
        .slice(0, 5),
      
      // Real-time capabilities
      realTime: {
        socketConnected: !!req.io,
        autoUpdates: !!req.io,
        lastUpdated: new Date().toISOString(),
        room: `employee_${req.userId}_sales`,
        features: {
          liveMetrics: !!req.io,
          instantNotifications: !!req.io,
          autoRefresh: false // Now handled by sockets
        }
      }
    };
    
    // ENHANCED: Emit metrics update if socket is available
    if (req.io && req.userId) {
      req.io.to(`employee_${req.userId}_sales`).emit("sales_metrics_realtime", {
        metrics,
        requestType: "api_call",
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: "Real-time employee sales metrics retrieved successfully", 
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve real-time sales metrics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// NEW: Subscribe to real-time employee dashboard updates
router.post("/dashboard/subscribe", (req, res) => {
  const { updateTypes = ["all"] } = req.body;
  
  if (!req.io) {
    return res.status(503).json({
      success: false,
      message: "Real-time functionality not available - Socket.io not connected"
    });
  }
  
  const validUpdateTypes = [
    "sales_metrics", 
    "approval_notifications", 
    "inventory_alerts", 
    "performance_updates",
    "dashboard_refresh",
    "all"
  ];
  
  const subscribedUpdates = Array.isArray(updateTypes) ? 
    updateTypes.filter(type => validUpdateTypes.includes(type)) : 
    ["all"];
  
  // If socket is available, emit subscription confirmation
  if (req.io && req.userId) {
    req.io.to(`employee_${req.userId}_sales`).emit("dashboard_subscription_confirmed", {
      subscribedUpdates,
      userId: req.userId,
      timestamp: new Date().toISOString(),
      message: "Dashboard real-time updates activated"
    });
  }
  
  res.json({
    success: true,
    message: "Successfully subscribed to real-time dashboard updates",
    data: {
      subscribedUpdates,
      socketConnected: true,
      userId: req.userId,
      userRole: req.user?.role,
      subscriptionRoom: `employee_${req.userId}_sales`,
      features: {
        instantNotifications: true,
        autoMetricsRefresh: true,
        approvalAlerts: true,
        inventoryWarnings: true
      },
      timestamp: new Date().toISOString()
    }
  });
});

// NEW: Subscribe to real-time sales list updates
router.post("/sales/subscribe", (req, res) => {
  const { filters = {}, autoRefresh = true } = req.body;
  
  if (!req.io) {
    return res.status(503).json({
      success: false,
      message: "Real-time functionality not available - Socket.io not connected"
    });
  }
  
  // If socket is available, emit subscription confirmation
  if (req.io && req.userId) {
    req.io.to(`employee_${req.userId}_sales`).emit("sales_subscription_confirmed", {
      filters,
      autoRefresh,
      userId: req.userId,
      timestamp: new Date().toISOString(),
      message: "Sales list real-time updates activated"
    });
  }
  
  res.json({
    success: true,
    message: "Successfully subscribed to real-time sales updates",
    data: {
      filters,
      autoRefresh,
      socketConnected: true,
      userId: req.userId,
      userRole: req.user?.role,
      subscriptionRoom: `employee_${req.userId}_sales`,
      features: {
        statusUpdates: true,
        approvalNotifications: true,
        rejectionAlerts: true,
        listAutoRefresh: autoRefresh
      },
      timestamp: new Date().toISOString()
    }
  });
});

// NEW: Get current socket connection status for employee
router.get("/socket/status", (req, res) => {
  const socketStatus = {
    connected: !!req.io,
    userId: req.userId,
    userRole: req.user?.role,
    rooms: {
      primary: `employee_${req.userId}_sales`,
      user: `user_${req.userId}`,
      dashboard: `dashboard_updates_${req.userId}`,
      salesTracking: `sales_tracking_${req.userId}`
    },
    capabilities: {
      dashboardUpdates: !!req.io,
      salesNotifications: !!req.io,
      approvalAlerts: !!req.io,
      inventoryWarnings: !!req.io,
      realTimeMetrics: !!req.io,
      instantFeedback: !!req.io
    },
    timestamp: new Date().toISOString()
  };
  
  res.json({
    success: true,
    message: socketStatus.connected ? "Socket.io is connected and ready" : "Socket.io is not available",
    data: socketStatus
  });
});

// NEW: Trigger manual dashboard refresh with socket notification
router.post("/dashboard/refresh", async (req, res) => {
  try {
    // This would typically call the dashboard controller method
    // but also emit real-time updates
    
    if (req.io && req.userId) {
      req.io.to(`employee_${req.userId}_sales`).emit("dashboard_refresh_triggered", {
        userId: req.userId,
        trigger: "manual",
        timestamp: new Date().toISOString(),
        message: "Dashboard refresh initiated"
      });
    }
    
    res.json({
      success: true,
      message: "Dashboard refresh triggered",
      data: {
        refreshInitiated: true,
        socketNotificationSent: !!req.io,
        userId: req.userId,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to trigger dashboard refresh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// NEW: Get employee notifications history
router.get("/notifications", async (req, res) => {
  try {
    const { limit = 20, type, unreadOnly = "false" } = req.query;
    
    // This would typically fetch from a notifications table
    // For now, we'll return a mock structure showing what notifications would look like
    const notifications = [
      {
        id: 1,
        type: "sale_approved",
        title: "Sale Approved",
        message: "Your sale #SALE-000123 was approved",
        read: false,
        priority: "success",
        timestamp: new Date().toISOString(),
        data: {
          saleNumber: "SALE-000123",
          amount: 15000,
          approvedBy: "Admin User"
        }
      },
      {
        id: 2,
        type: "inventory_alert",
        title: "Low Stock Alert",
        message: "Product 'Laptop Dell' is running low on stock",
        read: true,
        priority: "warning",
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        data: {
          productName: "Laptop Dell",
          currentStock: 3,
          minStock: 5
        }
      }
    ];
    
    res.json({
      success: true,
      message: "Employee notifications retrieved successfully",
      data: {
        notifications,
        summary: {
          total: notifications.length,
          unread: notifications.filter(n => !n.read).length,
          byType: {
            sale_approved: notifications.filter(n => n.type === "sale_approved").length,
            sale_rejected: notifications.filter(n => n.type === "sale_rejected").length,
            inventory_alert: notifications.filter(n => n.type === "inventory_alert").length
          }
        },
        realTime: {
          socketConnected: !!req.io,
          liveNotifications: !!req.io,
          room: `employee_${req.userId}_sales`
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

export default router