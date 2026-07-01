import { Router } from "express";
import {
  getBackups,
  getBackup,
  planAllBackups,
  postBrowserRestoreEvidence,
  postBrowserVerifyBackup,
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
router.post("/:id/browser-verify", requireRole("operator"), postBrowserVerifyBackup);
router.post("/:id/browser-restore-evidence", requireRole("admin"), postBrowserRestoreEvidence);
router.post("/:id/verify", requireRole("operator"), postVerifyBackup);
router.post("/:id/restore-plan", requireRole("operator"), postRestorePlan);
router.post("/:id/restore", requireRole("admin"), postRestoreBackup);

export default router;
