import { Router } from "express";
import { exportAudit, getAuditLogs, getAuditReport } from "../controllers/audit.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", requireRole("admin"), getAuditLogs);
router.get("/report", requireRole("admin"), getAuditReport);
router.get("/export", requireRole("admin"), exportAudit);

export default router;
