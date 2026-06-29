import { Router } from "express";
import {
  accessBrowserEvidenceEndpoint,
  executeAccessChangeEndpoint,
  getAccessUserEndpoint,
  getAccessUserSitesEndpoint,
  listAccessUsers,
  planAccessChangeEndpoint
} from "../controllers/access.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/users", listAccessUsers);
router.get("/users/:principalId", getAccessUserEndpoint);
router.get("/users/:principalId/sites", getAccessUserSitesEndpoint);
router.post("/changes/plan", requireRole("operator"), planAccessChangeEndpoint);
router.post("/changes/execute", requireRole("admin"), executeAccessChangeEndpoint);
router.post("/changes/browser-evidence", requireRole("admin"), accessBrowserEvidenceEndpoint);

export default router;
