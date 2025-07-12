// @ts-nocheck
import express, { Application, Request, Response, NextFunction } from "express";
import morgan from "morgan";
import cors from "cors";
import "reflect-metadata";
import { Server } from "socket.io";

import AuthRoutes from "./routes/authRoutes";
import EmployeeRoutes from "./routes/employeeRoutes";
import ProductRoutes from "./routes/productRoutes";
import StockMovementRoutes from "./routes/stockMovementRoutes";
import ReportRoutes from "./routes/reportRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import employeeRoutes from "./routes/employeeRoutes";
import reportRoutes from "./routes/reportRoutes";
import saleRoutes from "./routes/saleRoutes";
import adminRoutes from "./routes/adminRoutes"; 
import expenseRoutes from "./routes/expenseRoutes";

const app: Application = express();

declare global {
  namespace Express {
    interface Request {
      io?: Server;
    }
  }
}

// Enhanced CORS configuration for Socket.io
app.use(cors({
  origin: process.env.FRONTEND_URL || ["https://digikhatabackend-92wm.onrender.com"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Enhanced Morgan logging with Socket.io request detection
app.use(morgan("dev", {
  format: ":method :url :status :response-time ms - :res[content-length] :socket-status",
  tokens: {
    'socket-status': (req: any) => req.io ? '[Socket.io Available]' : '[Socket.io Unavailable]'
  }
}));

// ENHANCED: Socket.io availability middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Socket.io instance will be attached by server.ts
  // Add timestamp for real-time tracking
  req.requestTimestamp = new Date().toISOString();
  next();
});

// Enhanced route registration with Socket.io context
app.use("/api/user/", AuthRoutes);
app.use("/api/employee/", EmployeeRoutes);
app.use("/api/products", ProductRoutes);
app.use("/api/stock-movements", StockMovementRoutes);
app.use("/api/reports", ReportRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/reports", reportRoutes);

app.use("/api/sales", saleRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/expenses", expenseRoutes);

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ 
    message: "Welcome To The StockTrack API",
    timestamp: new Date().toISOString(),
    realTimeCapabilities: {
      socketIoAvailable: !!req.io,
      salesNotifications: !!req.io,
      autoApproval: !!req.io,
      dashboardUpdates: !!req.io
    },
    version: "2.0.0-enhanced",
    features: [
      "Real-time sales notifications",
      "Auto approval/rejection system", 
      "Live dashboard updates",
      "Socket.io integration",
      "Enhanced API responses"
    ]
  });
});

app.get("/api/health/socket", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    socketIo: {
      available: !!req.io,
      timestamp: new Date().toISOString()
    },
    message: req.io ? "Socket.io is available" : "Socket.io is not available"
  });
});

app.get("/api/capabilities", (req: Request, res: Response) => {
  const capabilities = {
    realTime: {
      salesNotifications: !!req.io,
      approvalSystem: !!req.io,
      dashboardUpdates: !!req.io,
      inventoryAlerts: !!req.io,
      bulkOperations: !!req.io
    },
    features: {
      autoRefresh: false, 
      pushNotifications: !!req.io,
      liveUpdates: !!req.io,
      instantFeedback: !!req.io
    },
    socketStatus: !!req.io ? "connected" : "disconnected",
    lastChecked: new Date().toISOString()
  };

  res.status(200).json({
    success: true,
    data: capabilities,
    message: "API capabilities retrieved successfully"
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("❌ Server Error:", err.stack);
  
  res.status(500).json({ 
    success: false,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
    requestId: req.requestTimestamp,
    socketAvailable: !!req.io,
    error: process.env.NODE_ENV === "development" ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    socketAvailable: !!req.io,
    availableEndpoints: [
      "GET /api/health/socket",
      "GET /api/capabilities", 
      "POST /api/sales",
      "GET /api/sales",
      "POST /api/admin/sales/:id/approve",
      "POST /api/admin/sales/:id/reject",
      "GET /api/admin/dashboard"
    ]
  });
});

declare global {
  namespace Express {
    interface Request {
      requestTimestamp?: string;
    }
  }
}

export default app;