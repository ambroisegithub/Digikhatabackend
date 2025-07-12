import dotenv from "dotenv"
dotenv.config()

import "reflect-metadata"

import app from "./app"
import DbConnection from "./database"
import { createServer } from "http"
import { Server } from "socket.io"
import { setupSocketHandlers } from "./socketHandlers";
import {  employeeSocketMiddleware, employeeActivityTracker } from "./middlewares/socketMiddleware";


const PORT = process.env.PORT || 3002
const httpServer = createServer(app)
app.use("/api/employee", employeeSocketMiddleware);
app.use("/api/employee", employeeActivityTracker);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || ["https://digikhatabackend-92wm.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000
})

app.use((req, res, next) => {
  req.io = io
  next()
})

setupSocketHandlers(io)

;(async () => {
  try {
    if (!DbConnection.isInitialized) {
      await DbConnection.initialize()
      console.log("✅ Database connection established successfully.")
    }

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`)
      console.log(`📡 Socket.io server is ready for real-time connections`)
      console.log(`🔗 Frontend should connect to: ws://localhost:${PORT}`)
      
      // Log socket connection status
      io.on("connection", (socket) => {
        console.log(`🔌 New socket connection: ${socket.id}`)
        
        socket.on("disconnect", () => {
          console.log(`🔌 Socket disconnected: ${socket.id}`)
        })
      })
    })

    // Enhanced error handling for socket connections
    io.on("error", (error) => {
      console.error("❌ Socket.io server error:", error)
    })

    // Log server readiness
    console.log("🎯 Real-time sales notifications: ENABLED")
    console.log("🎯 Auto approval/rejection: ENABLED")
    console.log("🎯 Dashboard real-time updates: ENABLED")
    
  } catch (error) {
    console.error("❌ Error initializing server:", error)
    process.exit(1)
  }
})()

// Enhanced graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server gracefully...")
  
  // Close socket connections
  io.close(() => {
    console.log("📡 Socket.io server closed")
  })
  
  // Close HTTP server
  httpServer.close(() => {
    console.log("🚀 HTTP server closed")
  })
  
  // Close database connection
  if (DbConnection.isInitialized) {
    await DbConnection.destroy()
    console.log("✅ Database connection closed")
  }
  
  process.exit(0)
})

export default httpServer