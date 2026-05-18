import { Router } from "express";
import { approveJobRequest, getJob, getJobs, rejectJobRequest, rerunJob } from "../controllers/jobs.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", getJobs);
router.get("/:id", getJob);
router.post("/:id/approve", requireRole("admin"), approveJobRequest);
router.post("/:id/reject", requireRole("admin"), rejectJobRequest);
router.post("/:id/rerun", requireRole("admin"), rerunJob);

export default router;
