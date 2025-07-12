// @ts-nocheck
import type { Server, Socket } from "socket.io"
import { Sale } from "../database/models/Sale"
import { Product } from "../database/models/Product"
import { StockMovement } from "../database/models/StockMovement"
import dbConnection from "../database"

export const setupSalesSocketHandlers = (io: Server) => {
  // Enhanced sales-related socket events
  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`)

    // Enhanced join sales room with user authentication
    socket.on("join_sales_room", async (userData: { userId: number; role: string; firstName?: string; lastName?: string }) => {
      try {
        // Store user data in socket for later use
        socket.data.user = userData

        if (userData.role === "admin") {
          socket.join("admin_sales_room")
          socket.join(`user_${userData.userId}`)
          console.log(`Admin ${userData.userId} (${userData.firstName} ${userData.lastName}) joined admin sales room`)
          
          // Send pending sales count to newly joined admin
          const pendingSalesCount = await dbConnection.getRepository(Sale).count({
            where: { status: "pending" }
          })
          
          socket.emit("initial_pending_count", {
            count: pendingSalesCount,
            message: `You have ${pendingSalesCount} pending sales to review`
          })

        } else if (userData.role === "employee") {
          socket.join(`employee_${userData.userId}_sales`)
          socket.join(`user_${userData.userId}`)
          console.log(`Employee ${userData.userId} (${userData.firstName} ${userData.lastName}) joined personal sales room`)
          
          // Send employee's recent sales status
          const recentSales = await dbConnection.getRepository(Sale).find({
            where: { soldBy: { id: userData.userId } },
            order: { createdAt: "DESC" },
            take: 5,
            relations: ["product"]
          })
          
          socket.emit("recent_sales_status", {
            sales: recentSales.map(sale => ({
              id: sale.id,
              saleNumber: sale.saleNumber,
              status: sale.status,
              totalPrice: sale.totalPrice,
              productName: sale.product.name,
              createdAt: sale.createdAt
            })),
            message: "Your recent sales status"
          })
        }

        socket.emit("sales_room_joined", {
          success: true,
          room: userData.role === "admin" ? "admin_sales_room" : `employee_${userData.userId}_sales`,
          userId: userData.userId,
          role: userData.role,
          message: `Successfully joined ${userData.role} sales room`
        })

        // Broadcast user online status to relevant rooms
        if (userData.role === "admin") {
          socket.to("admin_sales_room").emit("admin_online", {
            adminId: userData.userId,
            name: `${userData.firstName} ${userData.lastName}`,
            timestamp: new Date().toISOString()
          })
        }

      } catch (error:any) {
        console.error("Error joining sales room:", error)
        socket.emit("sales_room_joined", { 
          success: false, 
          error: "Failed to join sales room",
          details: error.message 
        })
      }
    })

    // Enhanced real-time sales data requests with filters
    socket.on("request_sales_update", async (filters: { status?: string; limit?: number }, callback) => {
      try {
        if (!socket.data.user) {
          return callback({ success: false, error: "Not authenticated" })
        }

        const saleRepository = dbConnection.getRepository(Sale)
        let sales = []
        const limit = filters?.limit || 50

        if (socket.data.user.role === "admin") {
          const whereConditions: any = {}
          if (filters?.status) {
            whereConditions.status = filters.status
          } else {
            whereConditions.status = "pending" // Default to pending for admins
          }

          sales = await saleRepository.find({
            where: whereConditions,
            relations: ["product", "product.category", "soldBy"],
            order: { createdAt: "DESC" },
            take: limit
          })
        } else {
          const whereConditions: any = { soldBy: { id: socket.data.user.userId } }
          if (filters?.status) {
            whereConditions.status = filters.status
          }

          sales = await saleRepository.find({
            where: whereConditions,
            relations: ["product", "product.category", "soldBy", "approvedBy"],
            order: { createdAt: "DESC" },
            take: limit
          })
        }

        callback({ 
          success: true, 
          data: sales,
          count: sales.length,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error("Error fetching sales update:", error)
        callback({ success: false, error: "Failed to fetch sales data" })
      }
    })

    // Enhanced real-time approval with transaction safety
    socket.on("approve_sale_realtime", async (data: { saleId: number; notes?: string }, callback) => {
      const queryRunner = dbConnection.createQueryRunner()
      await queryRunner.connect()
      await queryRunner.startTransaction()

      try {
        if (!socket.data.user || socket.data.user.role !== "admin") {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: "Unauthorized - Admin access required" })
        }

        const sale = await queryRunner.manager.findOne(Sale, {
          where: { id: data.saleId },
          relations: ["product", "soldBy", "product.category"],
        })

        if (!sale) {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: "Sale not found" })
        }

        if (sale.status !== "pending") {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: `Sale is ${sale.status}, not pending approval` })
        }

        // Update sale status
        sale.status = "approved"
        sale.approvedBy = { id: socket.data.user.userId } as any
        sale.approvedAt = new Date()
        if (data.notes) {
          sale.notes = data.notes
        }

        const updatedSale = await queryRunner.manager.save(sale)

        // Update product statistics
        await queryRunner.manager.update(Product, sale.product.id, {
          totalSales: () => `totalSales + ${sale.totalPrice}`,
          totalProfit: () => `totalProfit + ${sale.profit}`,
          lastSaleDate: new Date()
        })

        await queryRunner.commitTransaction()

        const responseData = {
          id: updatedSale.id,
          saleNumber: updatedSale.saleNumber,
          status: updatedSale.status,
          totalPrice: updatedSale.totalPrice,
          profit: updatedSale.profit,
          product: {
            id: sale.product.id,
            name: sale.product.name,
            category: sale.product.category.name,
          },
          soldBy: {
            id: sale.soldBy.id,
            firstName: sale.soldBy.firstName,
            lastName: sale.soldBy.lastName,
          },
          approvedBy: {
            id: socket.data.user.userId,
            name: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
          },
          approvedAt: updatedSale.approvedAt,
          notes: updatedSale.notes
        }

        // Enhanced notifications with rich data
        // Notify employee who made the sale
        io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_status_updated", {
          type: "approved",
          sale: responseData,
          notification: {
            title: "Sale Approved! 🎉",
            message: `Your sale #${updatedSale.saleNumber} for ${sale.product.name} has been approved by ${socket.data.user.firstName}`,
            amount: updatedSale.totalPrice,
            profit: updatedSale.profit,
            priority: "success",
            autoHide: false
          },
          timestamp: new Date().toISOString(),
        })

        // Notify all admins to update their pending list
        io.to("admin_sales_room").emit("sale_approved_broadcast", {
          saleId: updatedSale.id,
          saleNumber: updatedSale.saleNumber,
          approvedBy: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
          amount: updatedSale.totalPrice,
          employeeName: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
          productName: sale.product.name,
          timestamp: new Date().toISOString(),
        })

        // Update pending count for all admins
        const newPendingCount = await dbConnection.getRepository(Sale).count({
          where: { status: "pending" }
        })
        
        io.to("admin_sales_room").emit("pending_count_updated", {
          count: newPendingCount,
          action: "approved",
          saleNumber: updatedSale.saleNumber
        })

        callback({ 
          success: true, 
          data: responseData,
          message: "Sale approved successfully",
          pendingCount: newPendingCount
        })

        console.log(`Sale #${updatedSale.saleNumber} approved by admin ${socket.data.user.userId}`)

      } catch (error) {
        await queryRunner.rollbackTransaction()
        console.error("Error approving sale:", error)
        callback({ success: false, error: "Failed to approve sale", details: error.message })
      } finally {
        await queryRunner.release()
      }
    })

    // Enhanced real-time rejection with stock restoration
    socket.on("reject_sale_realtime", async (data: { saleId: number; reason: string }, callback) => {
      const queryRunner = dbConnection.createQueryRunner()
      await queryRunner.connect()
      await queryRunner.startTransaction()

      try {
        if (!socket.data.user || socket.data.user.role !== "admin") {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: "Unauthorized - Admin access required" })
        }

        if (!data.reason || data.reason.trim().length === 0) {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: "Rejection reason is required" })
        }

        const sale = await queryRunner.manager.findOne(Sale, {
          where: { id: data.saleId },
          relations: ["product", "soldBy", "product.category"],
        })

        if (!sale) {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: "Sale not found" })
        }

        if (sale.status !== "pending") {
          await queryRunner.rollbackTransaction()
          return callback({ success: false, error: `Sale is ${sale.status}, not pending approval` })
        }

        // Update sale status
        sale.status = "rejected"
        sale.approvedBy = { id: socket.data.user.userId } as any
        sale.approvedAt = new Date()
        sale.notes = data.reason

        await queryRunner.manager.save(sale)

        // Restore product stock
        await queryRunner.manager.update(Product, sale.product.id, {
          qtyInStock: () => `qtyInStock + ${sale.qtySold}`,
        })

        // Create stock movement record for restoration
        const stockMovement = queryRunner.manager.create(StockMovement, {
          product: sale.product,
          type: "in",
          quantity: sale.qtySold,
          reason: `Sale ${sale.saleNumber} rejection - Stock restored`,
          notes: `Rejected by ${socket.data.user.firstName} ${socket.data.user.lastName}: ${data.reason}`,
          recordedBy: { id: socket.data.user.userId } as any,
          movementDate: new Date(),
        })

        await queryRunner.manager.save(stockMovement)
        await queryRunner.commitTransaction()

        const responseData = {
          id: sale.id,
          saleNumber: sale.saleNumber,
          status: sale.status,
          totalPrice: sale.totalPrice,
          profit: sale.profit,
          product: {
            id: sale.product.id,
            name: sale.product.name,
            category: sale.product.category.name,
          },
          soldBy: {
            id: sale.soldBy.id,
            firstName: sale.soldBy.firstName,
            lastName: sale.soldBy.lastName,
          },
          rejectedBy: {
            id: socket.data.user.userId,
            name: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
          },
          rejectedAt: sale.approvedAt,
          rejectionReason: sale.notes,
          stockRestored: sale.qtySold
        }

        // Enhanced rejection notifications
        // Notify employee who made the sale
        io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_status_updated", {
          type: "rejected",
          sale: responseData,
          notification: {
            title: "Sale Rejected ❌",
            message: `Your sale #${sale.saleNumber} for ${sale.product.name} was rejected`,
            reason: data.reason,
            stockRestored: sale.qtySold,
            priority: "warning",
            autoHide: false
          },
          timestamp: new Date().toISOString(),
        })

        // Notify all admins
        io.to("admin_sales_room").emit("sale_rejected_broadcast", {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          rejectedBy: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
          reason: data.reason,
          amount: sale.totalPrice,
          employeeName: `${sale.soldBy.firstName} ${sale.soldBy.lastName}`,
          productName: sale.product.name,
          stockRestored: sale.qtySold,
          timestamp: new Date().toISOString(),
        })

        // Update pending count for all admins
        const newPendingCount = await dbConnection.getRepository(Sale).count({
          where: { status: "pending" }
        })
        
        io.to("admin_sales_room").emit("pending_count_updated", {
          count: newPendingCount,
          action: "rejected",
          saleNumber: sale.saleNumber
        })

        callback({ 
          success: true, 
          data: responseData,
          message: "Sale rejected successfully and stock restored",
          pendingCount: newPendingCount
        })

        console.log(`Sale #${sale.saleNumber} rejected by admin ${socket.data.user.userId}`)

      } catch (error) {
        await queryRunner.rollbackTransaction()
        console.error("Error rejecting sale:", error)
        callback({ success: false, error: "Failed to reject sale", details: error.message })
      } finally {
        await queryRunner.release()
      }
    })

    // New: Bulk approval functionality
    socket.on("bulk_approve_sales", async (data: { saleIds: number[]; notes?: string }, callback) => {
      if (!socket.data.user || socket.data.user.role !== "admin") {
        return callback({ success: false, error: "Unauthorized - Admin access required" })
      }

      const results = []
      let successCount = 0
      let failureCount = 0

      for (const saleId of data.saleIds) {
        try {
          // Use the existing approve logic for each sale
          const result = await approveSaleById(saleId, socket.data.user, data.notes)
          if (result.success) {
            successCount++
            // Emit individual notifications
            emitSaleApprovalNotification(io, result.data, socket.data.user)
          } else {
            failureCount++
          }
          results.push({ saleId, ...result })
        } catch (error) {
          failureCount++
          results.push({ saleId, success: false, error: error.message })
        }
      }

      // Update pending count
      const newPendingCount = await dbConnection.getRepository(Sale).count({
        where: { status: "pending" }
      })
      
      io.to("admin_sales_room").emit("pending_count_updated", {
        count: newPendingCount,
        action: "bulk_approved",
        successCount,
        failureCount
      })

      callback({
        success: true,
        message: `Bulk approval completed: ${successCount} approved, ${failureCount} failed`,
        results,
        pendingCount: newPendingCount
      })
    })

    // New: Get real-time dashboard stats
    socket.on("request_dashboard_stats", async (callback) => {
      try {
        if (!socket.data.user) {
          return callback({ success: false, error: "Not authenticated" })
        }

        const saleRepository = dbConnection.getRepository(Sale)
        const today = new Date()
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        
        let stats: any = {}

        if (socket.data.user.role === "admin") {
          const [pendingCount, todayApproved, totalRevenue] = await Promise.all([
            saleRepository.count({ where: { status: "pending" } }),
            saleRepository.count({ 
              where: { 
                status: "approved",
                salesDate: { $gte: startOfDay } as any
              } 
            }),
            saleRepository
              .createQueryBuilder("sale")
              .select("SUM(sale.totalPrice)", "total")
              .where("sale.status = :status", { status: "approved" })
              .andWhere("DATE(sale.salesDate) = DATE(:today)", { today })
              .getRawOne()
          ])

          stats = {
            pendingSales: pendingCount,
            todayApproved: todayApproved,
            todayRevenue: parseFloat(totalRevenue?.total || 0),
            role: "admin"
          }
        } else {
          const [mySalesCount, pendingCount, approvedCount] = await Promise.all([
            saleRepository.count({ 
              where: { 
                soldBy: { id: socket.data.user.userId },
                salesDate: { $gte: startOfDay } as any
              } 
            }),
            saleRepository.count({ 
              where: { 
                soldBy: { id: socket.data.user.userId },
                status: "pending"
              } 
            }),
            saleRepository.count({ 
              where: { 
                soldBy: { id: socket.data.user.userId },
                status: "approved",
                salesDate: { $gte: startOfDay } as any
              } 
            })
          ])

          stats = {
            todayMySales: mySalesCount,
            myPendingSales: pendingCount,
            myApprovedToday: approvedCount,
            role: "employee"
          }
        }

        callback({ 
          success: true, 
          data: stats,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error("Error fetching dashboard stats:", error)
        callback({ success: false, error: "Failed to fetch dashboard stats" })
      }
    })

    // Handle disconnection
    socket.on("disconnect", () => {
      if (socket.data.user) {
        console.log(`User ${socket.data.user.userId} (${socket.data.user.role}) disconnected`)
        
        // Notify relevant rooms about user going offline
        if (socket.data.user.role === "admin") {
          socket.to("admin_sales_room").emit("admin_offline", {
            adminId: socket.data.user.userId,
            name: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
            timestamp: new Date().toISOString()
          })
        }
      }
    })
  })
}

// Helper function to emit sale creation notification (enhanced)
export const emitSaleCreated = (io: Server, sale: any) => {
  try {
    const notificationData = {
      sale: {
        id: sale.id,
        saleNumber: sale.saleNumber,
        totalPrice: parseFloat(sale.totalPrice),
        profit: parseFloat(sale.profit),
        qtySold: sale.qtySold,
        product: {
          id: sale.product.id,
          name: sale.product.name,
          category: sale.product.category?.name || "Unknown",
          price: parseFloat(sale.product.price)
        },
        soldBy: {
          id: sale.soldBy.id,
          firstName: sale.soldBy.firstName,
          lastName: sale.soldBy.lastName,
        },
        customerName: sale.customerName || "Walk-in Customer",
        paymentMethod: sale.paymentMethod,
        salesDate: sale.salesDate,
        createdAt: sale.createdAt,
      },
      notification: {
        title: "New Sale Pending Approval! 📋",
        message: `${sale.soldBy.firstName} ${sale.soldBy.lastName} sold ${sale.product.name} for ${sale.totalPrice}`,
        priority: "info",
        autoHide: true,
        hideAfter: 10000 // 10 seconds
      },
      timestamp: new Date().toISOString(),
    }

    // Notify all admins about new sale pending approval
    io.to("admin_sales_room").emit("new_sale_pending", notificationData)

    // Update pending count for admins
    dbConnection.getRepository(Sale).count({ where: { status: "pending" } })
      .then(count => {
        io.to("admin_sales_room").emit("pending_count_updated", {
          count,
          action: "new_sale",
          saleNumber: sale.saleNumber
        })
      })

    // Notify the employee that their sale was created successfully
    io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_created_success", {
      sale: notificationData.sale,
      notification: {
        title: "Sale Created Successfully! ✅",
        message: `Your sale #${sale.saleNumber} is pending approval`,
        priority: "success",
        autoHide: true,
        hideAfter: 5000
      },
      timestamp: new Date().toISOString(),
    })

    console.log(`✅ Emitted new sale notification for sale #${sale.saleNumber}`)
  } catch (error) {
    console.error("❌ Error emitting sale created notification:", error)
  }
}

// Helper functions for bulk operations
async function approveSaleById(saleId: number, adminUser: any, notes?: string) {
  const queryRunner = dbConnection.createQueryRunner()
  await queryRunner.connect()
  await queryRunner.startTransaction()

  try {
    const sale = await queryRunner.manager.findOne(Sale, {
      where: { id: saleId },
      relations: ["product", "soldBy", "product.category"],
    })

    if (!sale) {
      await queryRunner.rollbackTransaction()
      return { success: false, error: "Sale not found" }
    }

    if (sale.status !== "pending") {
      await queryRunner.rollbackTransaction()
      return { success: false, error: `Sale is ${sale.status}` }
    }

    sale.status = "approved"
    sale.approvedBy = { id: adminUser.userId } as any
    sale.approvedAt = new Date()
    if (notes) sale.notes = notes

    const updatedSale = await queryRunner.manager.save(sale)

    await queryRunner.manager.update(Product, sale.product.id, {
      totalSales: () => `totalSales + ${sale.totalPrice}`,
      totalProfit: () => `totalProfit + ${sale.profit}`,
      lastSaleDate: new Date()
    })

    await queryRunner.commitTransaction()
    return { success: true, data: updatedSale }

  } catch (error:any) {
    await queryRunner.rollbackTransaction()
    return { success: false, error: error.message }
  } finally {
    await queryRunner.release()
  }
}

function emitSaleApprovalNotification(io: Server, sale: any, adminUser: any) {
  // Emit to employee
  io.to(`employee_${sale.soldBy.id}_sales`).emit("sale_status_updated", {
    type: "approved",
    sale: sale,
    notification: {
      title: "Sale Approved! 🎉",
      message: `Your sale #${sale.saleNumber} was approved`,
      priority: "success",
      autoHide: false
    },
    timestamp: new Date().toISOString(),
  })
}