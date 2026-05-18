import { Router } from "express";
import { getCapabilities, getSiteSummary } from "../controllers/operations.controller";

const router = Router();

router.get("/capabilities", getCapabilities);
router.get("/sites/:id/summary", getSiteSummary);

export default router;
