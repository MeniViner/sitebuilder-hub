import { Router } from "express";
import { getNextVersion, getVersionStatus } from "../controllers/releases.controller";

const router = Router();

router.post("/next", getNextVersion);
router.get("/status", getVersionStatus);

export default router;
