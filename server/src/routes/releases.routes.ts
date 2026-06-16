import { Router } from "express";
import {
  deployBatch,
  deployAll,
  getReleaseArtifactFileEndpoint,
  getReleaseArtifactManifestEndpoint,
  getReleaseArtifactValidation,
  getReleases,
  planBatchDeploy,
  postRelease
} from "../controllers/releases.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", getReleases);
router.post("/", requireRole("admin"), postRelease);
router.get("/:id/artifact/manifest", requireRole("operator"), getReleaseArtifactManifestEndpoint);
router.get("/:id/artifact/file", requireRole("admin"), getReleaseArtifactFileEndpoint);
router.get("/:id/artifact/validate", requireRole("operator"), getReleaseArtifactValidation);
router.post("/:id/deployment-plan", requireRole("operator"), planBatchDeploy);
router.post("/:id/deploy-batch", requireRole("admin"), deployBatch);
router.post("/:id/deploy-all", requireRole("admin"), deployAll);

export default router;
