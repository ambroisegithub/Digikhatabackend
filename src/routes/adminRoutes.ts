// @ts-nocheck
import { Router } from "express";
import { body, param } from "express-validator";
import { AdminController } from "../controllers/AdminController";
import { authenticate, authorize } from "../middlewares/authMiddleware";
import { UserRole } from "../Enums/UserRole";

const router = Router();

router.use(authenticate);

router.use(authorize([UserRole.ADMIN]));

router.get("/dashboard", AdminController.getDashboardOverview);
router.get("/dashboard/sales-aggregation", AdminController.getDailySalesAggregation);
router.get("/dashboard/profit-analysis", AdminController.getProfitAnalysis);

router.get("/employees", AdminController.getAllEmployeesWithPerformance);

router.post(
  "/sales/:saleId/approve",
  param("saleId").isInt().withMessage("Valid sale ID is required"),
  AdminController.approveSale
);

router.post(
  "/sales/:saleId/reject",
  param("saleId").isInt().withMessage("Valid sale ID is required"),
  body("reason").optional().isString().withMessage("Reason must be a string"),
  AdminController.rejectSale
);





export default router;