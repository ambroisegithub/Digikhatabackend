// @ts-nocheck
import type { Request, Response, NextFunction } from "express"
import type { Server } from "socket.io"

// Middleware to enhance employee responses with socket capabilities
export const employeeSocketMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Store original res.json method
  const originalJson = res.json.bind(res)
  
  // Override res.json to add socket notifications for employee endpoints
  res.json = function(body: any) {
    // Check if this is an employee-related successful response
    if (body.success && req.userId && req.user?.role === "employee" && req.io) {
      
      // Determine endpoint type and emit appropriate socket events
      const path = req.path.toLowerCase()
      const method = req.method.toUpperCase()
      
      // Dashboard endpoint enhancements
      if (path.includes("/dashboard") && method === "GET") {
        emitDashboardUpdate(req.io, req.userId, body.data, "api_refresh")
      }
      
      // Sales endpoint enhancements  
      else if (path.includes("/sales") && method === "GET" && !path.includes("/daily-summary")) {
        emitSalesListUpdate(req.io, req.userId, body.data, "api_refresh")
      }
      
      // Sale creation enhancements
      else if (path.includes("/sell") && method === "POST") {
        emitSaleCreationUpdate(req.io, req.userId, body.data, "new_sale")
      }
      
      // Performance endpoint enhancements
      else if (path.includes("/performance") && method === "GET") {
        emitPerformanceUpdate(req.io, req.userId, body.data, "performance_check")
      }
    }
    
    // Call original json method
    return originalJson(body)
  }
  
  next()
}

// Helper function to emit dashboard updates
function emitDashboardUpdate(io: Server, userId: number, dashboardData: any, trigger: string) {
  try {
    io.to(`employee_${userId}_sales`).emit("dashboard_api_updated", {
      type: "dashboard_overview",
      trigger: trigger,
      data: {
        summary: dashboardData.summary,
        alerts: {
          pendingCount: dashboardData.alerts?.pendingApprovals?.length || 0,
          inventoryCount: dashboardData.alerts?.inventoryAlerts?.length || 0,
          urgentCount: dashboardData.alerts?.pendingApprovals?.filter((sale: any) => 
            sale.realTimeStatus?.urgent
          )?.length || 0
        },
        performance: {
          todayRevenue: dashboardData.summary?.today?.revenue || 0,
          todayProfit: dashboardData.summary?.today?.profit || 0,
          todayTransactions: dashboardData.summary?.today?.transactions || 0
        }
      },
      timestamp: new Date().toISOString(),
      notification: {
        title: "Dashboard Updated 📊",
        message: "Your dashboard data has been refreshed",
        priority: "info",
        autoHide: true,
        hideAfter: 2000
      }
    })
    
    console.log(`📊 Dashboard API update emitted for employee ${userId}`)
  } catch (error) {
    console.error("Error emitting dashboard update:", error)
  }
}

// Helper function to emit sales list updates
function emitSalesListUpdate(io: Server, userId: number, salesData: any, trigger: string) {
  try {
    const urgentPending = salesData.sales?.filter((sale: any) => 
      sale.realTimeStatus?.urgent
    )?.length || 0
    
    io.to(`employee_${userId}_sales`).emit("sales_list_api_updated", {
      type: "sales_view",
      trigger: trigger,
      data: {
        totalRecords: salesData.pagination?.total || 0,
        currentPage: salesData.pagination?.current || 1,
        summary: salesData.summary,
        alerts: {
          urgentPending: urgentPending,
          totalPending: salesData.summary?.pendingSales || 0,
          needsAttention: urgentPending > 0
        }
      },
      timestamp: new Date().toISOString(),
      notification: urgentPending > 0 ? {
        title: "Urgent Sales Alert ⚠️",
        message: `You have ${urgentPending} sales pending for more than 2 hours`,
        priority: "warning",
        autoHide: false
      } : {
        title: "Sales Data Updated 📈",
        message: "Your sales list has been refreshed",
        priority: "info",
        autoHide: true,
        hideAfter: 2000
      }
    })
    
    console.log(`📈 Sales list API update emitted for employee ${userId}`)
  } catch (error) {
    console.error("Error emitting sales list update:", error)
  }
}

// Helper function to emit sale creation updates
function emitSaleCreationUpdate(io: Server, userId: number, saleData: any, trigger: string) {
  try {
    io.to(`employee_${userId}_sales`).emit("sale_creation_api_success", {
      type: "sale_created",
      trigger: trigger,
      data: {
        saleNumber: saleData.saleNumber,
        amount: saleData.totalPrice,
        profit: saleData.profit,
        status: saleData.status,
        productName: saleData.product?.name
      },
      timestamp: new Date().toISOString(),
      notification: {
        title: "Sale Created Successfully! ✅",
        message: `Sale #${saleData.saleNumber} created and pending approval`,
        priority: "success",
        autoHide: true,
        hideAfter: 5000
      }
    })
    
    // Also emit to dashboard updates room for metrics refresh
    io.to(`dashboard_updates_${userId}`).emit("dashboard_refresh_needed", {
      reason: "new_sale_created",
      saleData: {
        saleNumber: saleData.saleNumber,
        amount: saleData.totalPrice,
        profit: saleData.profit
      },
      timestamp: new Date().toISOString()
    })
    
    console.log(`✅ Sale creation API update emitted for employee ${userId}`)
  } catch (error) {
    console.error("Error emitting sale creation update:", error)
  }
}

// Helper function to emit performance updates
function emitPerformanceUpdate(io: Server, userId: number, performanceData: any, trigger: string) {
  try {
    const topProduct = performanceData.products?.[0]
    
    io.to(`employee_${userId}_sales`).emit("performance_api_updated", {
      type: "performance_metrics",
      trigger: trigger,
      data: {
        summary: performanceData.summary,
        topProduct: topProduct ? {
          name: topProduct.productName,
          sales: topProduct.sales,
          profit: topProduct.profit
        } : null,
        insights: {
          totalProductsSold: performanceData.summary?.totalProductsSold || 0,
          totalRevenue: performanceData.summary?.totalSales || 0,
          totalProfit: performanceData.summary?.totalProfit || 0
        }
      },
      timestamp: new Date().toISOString(),
      notification: {
        title: "Performance Data Updated 📊",
        message: topProduct ? 
          `Your top product: ${topProduct.productName}` : 
          "Performance metrics refreshed",
        priority: "info",
        autoHide: true,
        hideAfter: 3000
      }
    })
    
    console.log(`📊 Performance API update emitted for employee ${userId}`)
  } catch (error) {
    console.error("Error emitting performance update:", error)
  }
}

// Middleware to add socket context to requests
export const addSocketContext = (io: Server) => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.io = io
    next()
  }
}

// Helper function to broadcast system-wide updates
export const broadcastSystemUpdate = (io: Server, updateType: string, data: any) => {
  try {
    // Broadcast to all connected employees
    io.to("employees").emit("system_update", {
      type: updateType,
      data: data,
      timestamp: new Date().toISOString()
    })
    
    // Broadcast to all connected admins
    io.to("admin_sales_room").emit("system_update", {
      type: updateType,
      data: data,
      timestamp: new Date().toISOString()
    })
    
    console.log(`📡 System update broadcasted: ${updateType}`)
  } catch (error) {
    console.error("Error broadcasting system update:", error)
  }
}

// Helper function to emit inventory alerts to all employees
export const broadcastInventoryAlert = (io: Server, productData: any) => {
  try {
    const alertData = {
      type: "inventory_alert",
      product: {
        id: productData.id,
        name: productData.name,
        currentStock: productData.qtyInStock,
        minStock: productData.minStockLevel || 5
      },
      severity: productData.qtyInStock === 0 ? "critical" : 
                productData.qtyInStock <= 2 ? "high" : "medium",
      timestamp: new Date().toISOString(),
      notification: {
        title: productData.qtyInStock === 0 ? "Product Out of Stock! 🚫" : "Low Stock Warning ⚠️",
        message: `${productData.name} - Stock: ${productData.qtyInStock}`,
        priority: productData.qtyInStock === 0 ? "critical" : "warning",
        autoHide: false
      }
    }
    
    // Broadcast to all employees since they all can sell products
    io.emit("inventory_alert_broadcast", alertData)
    
    console.log(`🚨 Inventory alert broadcasted for product: ${productData.name}`)
  } catch (error) {
    console.error("Error broadcasting inventory alert:", error)
  }
}

// Helper function to emit employee-specific achievement notifications
export const emitEmployeeAchievement = (io: Server, userId: number, achievement: any) => {
  try {
    io.to(`employee_${userId}_sales`).emit("achievement_unlocked", {
      type: "achievement",
      achievement: {
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon || "🏆",
        value: achievement.value,
        category: achievement.category // e.g., "sales", "profit", "streak"
      },
      timestamp: new Date().toISOString(),
      notification: {
        title: `Achievement Unlocked! ${achievement.icon || "🏆"}`,
        message: achievement.title,
        priority: "celebration",
        autoHide: false
      }
    })
    
    console.log(`🏆 Achievement emitted for employee ${userId}: ${achievement.title}`)
  } catch (error) {
    console.error("Error emitting employee achievement:", error)
  }
}

// Middleware to track employee activity for real-time insights
export const employeeActivityTracker = (req: Request, res: Response, next: NextFunction) => {
  // Store original res.json to intercept successful responses
  const originalJson = res.json.bind(res)
  
  res.json = function(body: any) {
    // Track successful employee activities
    if (body.success && req.userId && req.user?.role === "employee" && req.io) {
      const activity = {
        userId: req.userId,
        endpoint: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
        data: extractActivityData(req.path, req.method, body)
      }
      
      // Emit activity tracking
      req.io.to(`employee_${req.userId}_sales`).emit("activity_tracked", {
        activity: activity,
        sessionInfo: {
          activeEndpoint: req.path,
          lastAction: new Date().toISOString()
        }
      })
      
      // Check for activity-based achievements
      checkActivityAchievements(req.io, req.userId, activity)
    }
    
    return originalJson(body)
  }
  
  next()
}

// Helper function to extract relevant activity data
function extractActivityData(path: string, method: string, responseBody: any) {
  const data: any = {
    action: `${method} ${path}`
  }
  
  // Extract specific data based on endpoint
  if (path.includes("/dashboard")) {
    data.dashboardMetrics = {
      todayRevenue: responseBody.data?.summary?.today?.revenue,
      todayTransactions: responseBody.data?.summary?.today?.transactions,
      pendingCount: responseBody.data?.alerts?.pendingApprovals?.length
    }
  } else if (path.includes("/sales") && !path.includes("/sell")) {
    data.salesMetrics = {
      totalSales: responseBody.data?.summary?.totalSales,
      totalTransactions: responseBody.data?.summary?.totalTransactions,
      pendingCount: responseBody.data?.summary?.pendingSales
    }
  } else if (path.includes("/sell")) {
    data.saleCreated = {
      saleNumber: responseBody.data?.saleNumber,
      amount: responseBody.data?.totalPrice,
      profit: responseBody.data?.profit,
      productName: responseBody.data?.product?.name
    }
  }
  
  return data
}

// Helper function to check for activity-based achievements
function checkActivityAchievements(io: Server, userId: number, activity: any) {
  try {
    const achievements = []
    
    // Check for sales-related achievements
    if (activity.data.saleCreated) {
      const saleAmount = activity.data.saleCreated.amount
      
      if (saleAmount >= 100000) { // 100k RWF sale
        achievements.push({
          id: "big_sale",
          title: "Big Sale Achievement!",
          description: `Congratulations on your ${saleAmount.toLocaleString()} RWF sale!`,
          icon: "💰",
          value: saleAmount,
          category: "sales"
        })
      }
      
      if (activity.data.saleCreated.profit >= 50000) { // 50k RWF profit
        achievements.push({
          id: "high_profit",
          title: "High Profit Achievement!",
          description: `Excellent profit margin of ${activity.data.saleCreated.profit.toLocaleString()} RWF!`,
          icon: "📈",
          value: activity.data.saleCreated.profit,
          category: "profit"
        })
      }
    }
    
    // Check for dashboard activity achievements
    if (activity.data.dashboardMetrics) {
      const todayTransactions = activity.data.dashboardMetrics.todayTransactions
      
      if (todayTransactions >= 10) {
        achievements.push({
          id: "active_seller",
          title: "Active Seller!",
          description: `${todayTransactions} sales today - Keep it up!`,
          icon: "🔥",
          value: todayTransactions,
          category: "activity"
        })
      }
    }
    
    // Emit achievements
    achievements.forEach(achievement => {
      emitEmployeeAchievement(io, userId, achievement)
    })
    
  } catch (error) {
    console.error("Error checking activity achievements:", error)
  }
}

// Middleware to handle employee socket room management
export const employeeRoomManager = (req: Request, res: Response, next: NextFunction) => {
  if (req.io && req.userId && req.user?.role === "employee") {
    // Ensure employee is in their designated rooms
    const employeeRooms = [
      `employee_${req.userId}_sales`,
      `user_${req.userId}`,
      `dashboard_updates_${req.userId}`,
      `sales_tracking_${req.userId}`
    ]
    
    // This would typically be handled by socket connection,
    // but we can emit a room verification event
    req.io.to(`employee_${req.userId}_sales`).emit("room_verification", {
      userId: req.userId,
      expectedRooms: employeeRooms,
      timestamp: new Date().toISOString(),
      message: "Verifying room subscriptions"
    })
  }
  
  next()
}

// Helper function to emit real-time notifications for employee actions
export const emitEmployeeNotification = (
  io: Server, 
  userId: number, 
  notification: {
    title: string;
    message: string;
    type: "success" | "warning" | "error" | "info";
    data?: any;
    autoHide?: boolean;
    hideAfter?: number;
  }
) => {
  try {
    io.to(`employee_${userId}_sales`).emit("employee_notification", {
      notification: {
        ...notification,
        id: Date.now(),
        timestamp: new Date().toISOString(),
        userId: userId
      },
      timestamp: new Date().toISOString()
    })
    
    console.log(`🔔 Notification sent to employee ${userId}: ${notification.title}`)
  } catch (error) {
    console.error("Error emitting employee notification:", error)
  }
}

// Helper function to emit batch updates for dashboard and sales
export const emitEmployeeBatchUpdate = (
  io: Server,
  userId: number,
  updates: {
    dashboard?: any;
    sales?: any;
    performance?: any;
    alerts?: any;
  }
) => {
  try {
    io.to(`employee_${userId}_sales`).emit("employee_batch_update", {
      updates: updates,
      timestamp: new Date().toISOString(),
      updateCount: Object.keys(updates).length,
      notification: {
        title: "Data Updated 🔄",
        message: `${Object.keys(updates).length} sections updated`,
        priority: "info",
        autoHide: true,
        hideAfter: 3000
      }
    })
    
    console.log(`🔄 Batch update emitted for employee ${userId}:`, Object.keys(updates))
  } catch (error) {
    console.error("Error emitting employee batch update:", error)
  }
}

// Export middleware functions for use in routes
export {
  emitDashboardUpdate,
  emitSalesListUpdate,
  emitSaleCreationUpdate,
  emitPerformanceUpdate,
  emitEmployeeAchievement
}