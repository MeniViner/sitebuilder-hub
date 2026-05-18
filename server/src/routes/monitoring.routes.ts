import { Router } from "express";
import {
  getMonitoringAlertsSummary,
  getMonitoringAlerts,
  postAcknowledgeMonitoringAlert,
  postRefreshMonitoringAlerts
} from "../controllers/monitoring.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/alerts", requireRole("operator"), getMonitoringAlerts);
router.get("/summary", requireRole("operator"), getMonitoringAlertsSummary);
router.post("/alerts/refresh", requireRole("admin"), postRefreshMonitoringAlerts);
router.post("/alerts/:id/acknowledge", requireRole("admin"), postAcknowledgeMonitoringAlert);

export default router;
