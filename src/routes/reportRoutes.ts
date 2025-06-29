// @ts-nocheck

import { Router } from "express"
import { ReportController } from "../controllers/ReportController"
import {authenticate} from "../middlewares/authMiddleware"

const router = Router()


router.get("/dashboard",authenticate, ReportController.getDashboardSummary)

router.get("/profit", authenticate, ReportController.getProfitReport)

router.get("/products/:productId/profit",authenticate, ReportController.getProductProfitHistory)

export default router
