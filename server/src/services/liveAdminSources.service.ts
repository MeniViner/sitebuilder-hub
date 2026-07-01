import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { AdminIdentity, buildAdminDiff } from "./admins.service";

type SourceStatus = {
  source: "txt" | "siteCollection" | "ownersGroup";
  ok: boolean;
  count: number;
  error?: string;
};

export type LiveAdminSourcesResult = {
  siteId: string;
  siteCode: string;
  capturedAt: string;
  txtAdmins: AdminIdentity[];
  siteCollectionAdmins: AdminIdentity[];
  ownersGroupAdmins: AdminIdentity[];
  adminDifferences: ReturnType<typeof buildAdminDiff>;
  adminsCount: number;
  sourceStatus: SourceStatus[];
};

export async function readLiveAdminSources(siteId: string, options: { persist?: boolean; jobId?: string; capturedBy?: string } = {}): Promise<LiveAdminSourcesResult> {
  logger.info("admins", "Live admin source read started", {
    siteId,
    persist: Boolean(options.persist),
    jobId: options.jobId,
    capturedBy: options.capturedBy
  });

  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");
  logger.warn("admins", "Live SharePoint admin source read blocked; SharePoint admin/TXT reads must run in the browser", {
    siteId: site._id.toString(),
    siteCode: site.siteCode
  });
  throw new Error("browser-sharepoint-required");
}
