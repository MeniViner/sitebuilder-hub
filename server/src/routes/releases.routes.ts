import { Router } from "express";
import {
  deployAll,
  getReleaseArtifactValidation,
  getReleases,
  postRelease
} from "../controllers/releases.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", getReleases);
router.post("/", requireRole("admin"), postRelease);
router.get("/:id/artifact/validate", requireRole("operator"), getReleaseArtifactValidation);
router.post("/:id/deploy-all", requireRole("admin"), deployAll);

export default router;
