import { Router } from "express";
import { getCapabilities, getSiteSummary, getStatus } from "../controllers/operations.controller";

const router = Router();

router.get("/capabilities", getCapabilities);
router.get("/status", getStatus);
router.get("/sites/:id/summary", getSiteSummary);

export default router;
