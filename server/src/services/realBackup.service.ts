import { logger } from "../utils/logger";

export type ExecuteSharePointBackupInput = {
  siteId: string;
  jobId: string;
  createdBy: string;
  sourcePaths?: string[];
};

export type ExecuteSharePointRestoreInput = {
  backupId: string;
  jobId: string;
  requestedBy: string;
  siteId?: string;
};

export async function executeSharePointBackup(input: ExecuteSharePointBackupInput): Promise<never> {
  logger.info("backups", "SharePoint backup execution blocked on server", {
    siteId: input.siteId,
    jobId: input.jobId,
    createdBy: input.createdBy
  });
  throw new Error("sharepoint-browser-execution-required");
}

export async function executeSharePointRestore(input: ExecuteSharePointRestoreInput): Promise<never> {
  logger.info("backups", "SharePoint restore execution blocked on server", {
    backupId: input.backupId,
    jobId: input.jobId,
    requestedBy: input.requestedBy,
    siteId: input.siteId
  });
  throw new Error("sharepoint-browser-execution-required");
}
