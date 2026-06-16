import { Router } from "express";
import {
  createSite,
  deleteSite,
  getSiteBootstrapPlan,
  getSiteProvisionPlan,
  getSite,
  listSites,
  manualHealthCheck,
  getPermissionsSetupPlan,
  queueSiteBootstrap,
  queueSiteProvision,
  queuePermissionsSetup,
  browserSharePointHealthCheckEvidence,
  readOnlySharePointHealthCheck,
  updateSite
} from "../controllers/sites.controller";
import {
  deploySiteVersion,
  getSiteDeployments,
  planRollbackSiteVersion,
  planSiteDeployVersion,
  recordBrowserDeploymentEvidence,
  rollbackSiteVersion
} from "../controllers/releases.controller";
import {
  getSiteBackups,
  getSiteBackupInventory,
  planSiteBackup,
  runSiteBackup
} from "../controllers/backups.controller";
import {
  addAdmin,
  deleteAdmin,
  getAdmins,
  getAdminsDiffEndpoint,
  planTxtAdminRepair,
  queueTxtAdminRepair,
  readLiveAdminsEndpoint,
  syncAdmins
} from "../controllers/admins.controller";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/", listSites);
router.get("/:id", getSite);
router.post("/", requireRole("operator"), createSite);
router.patch("/:id", requireRole("operator"), updateSite);
router.delete("/:id", requireRole("operator"), deleteSite);
router.post("/:id/health-check/manual", requireRole("operator"), manualHealthCheck);
router.post("/:id/health-check/sharepoint-readonly", requireRole("operator"), readOnlySharePointHealthCheck);
router.post("/:id/health-check/browser-sharepoint", requireRole("operator"), browserSharePointHealthCheckEvidence);
router.get("/:id/bootstrap/plan", requireRole("operator"), getSiteBootstrapPlan);
router.post("/:id/bootstrap", requireRole("admin"), queueSiteBootstrap);
router.get("/:id/provision/plan", requireRole("operator"), getSiteProvisionPlan);
router.post("/:id/provision", requireRole("admin"), queueSiteProvision);
router.get("/:id/permissions/plan", requireRole("operator"), getPermissionsSetupPlan);
router.post("/:id/permissions/setup", requireRole("admin"), queuePermissionsSetup);

router.post("/:id/deploy-version/plan", requireRole("operator"), planSiteDeployVersion);
router.post("/:id/deploy-version", requireRole("admin"), deploySiteVersion);
router.post("/:id/deployments/browser-evidence", requireRole("admin"), recordBrowserDeploymentEvidence);
router.post("/:id/rollback-version/plan", requireRole("operator"), planRollbackSiteVersion);
router.post("/:id/rollback-version", requireRole("admin"), rollbackSiteVersion);
router.get("/:id/deployments", getSiteDeployments);

router.get("/:id/backups", getSiteBackups);
router.get("/:id/backups/inventory", requireRole("operator"), getSiteBackupInventory);
router.post("/:id/backups/plan", requireRole("operator"), planSiteBackup);
router.post("/:id/backups", requireRole("operator"), runSiteBackup);

router.get("/:id/admins", getAdmins);
router.post("/:id/admins/live-read", requireRole("operator"), readLiveAdminsEndpoint);
router.post("/:id/admins/sync", requireRole("operator"), syncAdmins);
router.post("/:id/admins/repair-txt/plan", requireRole("operator"), planTxtAdminRepair);
router.post("/:id/admins/repair-txt", requireRole("admin"), queueTxtAdminRepair);
router.post("/:id/admins", requireRole("operator"), addAdmin);
router.delete("/:id/admins/:adminId", requireRole("operator"), deleteAdmin);
router.get("/:id/admins/diff", getAdminsDiffEndpoint);

export default router;
