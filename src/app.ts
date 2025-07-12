import express, { Application, Request, Response, NextFunction } from "express";
import morgan from "morgan";
import cors from "cors";
import "reflect-metadata";

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

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

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

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ message: "Welcome To The StockTrack API" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

export default app;