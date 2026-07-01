import { Site } from "../models/Site";
import { logger } from "../utils/logger";

const assertSiteExists = async (siteId: string) => {
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");
  return site;
};

export async function buildTxtAdminRepairPlan(params: {
  siteId: string;
  requestedBy: string;
  notes?: string;
}): Promise<never> {
  logger.info("admins", "TXT admin repair plan blocked on server", {
    siteId: params.siteId,
    requestedBy: params.requestedBy,
    notes: params.notes
  });
  await assertSiteExists(params.siteId);
  throw new Error("browser-sharepoint-required");
}

export async function enqueueTxtAdminRepair(params: {
  siteId: string;
  createdBy: string;
  notes?: string;
}): Promise<never> {
  logger.info("admins", "TXT admin repair queue blocked on server", {
    siteId: params.siteId,
    createdBy: params.createdBy,
    notes: params.notes
  });
  await assertSiteExists(params.siteId);
  throw new Error("browser-sharepoint-required");
}

export async function executeTxtAdminRepair(params: {
  siteId: string;
  jobId: string;
  requestedBy: string;
}): Promise<never> {
  logger.info("admins", "TXT admin repair execution blocked on server", {
    siteId: params.siteId,
    jobId: params.jobId,
    requestedBy: params.requestedBy
  });
  await assertSiteExists(params.siteId);
  throw new Error("browser-sharepoint-required");
}
