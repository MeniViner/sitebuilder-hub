import { Router } from "express";
import {
  getBackups,
  getBackup,
  planAllBackups,
  postRestoreBackup,
  postRestorePlan,
  postVerifyBackup,
  runAllBackups
} from "../controllers/backups.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", getBackups);
router.post("/plan-all", requireRole("operator"), planAllBackups);
router.post("/run-all", requireRole("admin"), runAllBackups);
router.get("/:id", getBackup);
router.post("/:id/verify", requireRole("operator"), postVerifyBackup);
router.post("/:id/restore-plan", requireRole("operator"), postRestorePlan);
router.post("/:id/restore", requireRole("admin"), postRestoreBackup);

export default router;
