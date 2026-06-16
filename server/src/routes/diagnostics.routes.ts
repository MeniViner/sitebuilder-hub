import { Router } from "express";
import { diagnostics, sharePointCheck } from "../controllers/diagnostics.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", requireRole("viewer"), diagnostics);
router.post("/sharepoint-check", requireRole("operator"), sharePointCheck);

export default router;
