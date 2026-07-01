import type {
  AdminTxtRepairPlan,
  Backup,
  BackupRestoreEvidence,
  BrowserRestoreOperationPlan,
  BrowserSiteOperationEvidencePayload,
  DeploymentVerificationEvidence,
  MongoCreateBrowserEvidenceInput,
  MongoRuntimeConfigContent,
  TxtToMongoMigrationInput
} from "../api/sitesApi";
import type { Site } from "../types/site";
import { resolveSiteBuilderPaths, type SiteBuilderResolvedPaths } from "./sitebuilderPaths";
import {
  buildSharePointApiUrl,
  ensureSharePointDocumentLibraryBrowser,
  ensureSharePointFolderHierarchyBrowser,
  ensureSharePointTextFileIfMissingBrowser,
  normalizeSharePointSiteUrl
} from "./sharepointBrowserConnector";
import {
  readBackVerifyForBrowserOperation,
  readFileForBrowserOperation,
  requestDigestForBrowserOperation,
  uploadBinaryFileForBrowserOperation,
  writeTextFileForBrowserOperation,
  type BrowserSharePointOperationStepEvidence
} from "./sharepointBrowserOperationRunner";

type StepEvidence = {
  step: string;
  status: "succeeded" | "failed" | "skipped";
  path?: string;
  httpStatus?: number;
  error?: string;
};

const normalizeAdminKey = (admin: any) =>
  [
    admin?.loginName?.trim?.().toLowerCase?.(),
    admin?.email?.trim?.().toLowerCase?.(),
    admin?.personalNumber?.trim?.().toLowerCase?.(),
    admin?.displayName?.trim?.().toLowerCase?.(),
    admin?.name?.trim?.().toLowerCase?.()
  ].find(Boolean) || "";

const initialUsersForSite = (site: Site) => {
  const candidates = [
    {
      displayName: site.ownerName,
      personalNumber: site.ownerPersonalNumber,
      email: site.ownerEmail,
      loginName: ""
    },
    ...(site.txtAdmins || [])
  ];
  const seen = new Set<string>();
  return candidates.flatMap((admin, index) => {
    const normalized = {
      id: index + 1,
      name: String(admin.displayName || "").trim() || String(admin.personalNumber || admin.email || "").trim(),
      role: "admin",
      personalNumber: String(admin.personalNumber || "").trim(),
      email: String(admin.email || "").trim(),
      loginName: String(admin.loginName || "").trim()
    };
    const key = normalizeAdminKey(normalized);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
};

const defaultTxtSeedFiles = (site: Site, paths: SiteBuilderResolvedPaths) => [
  { path: paths.txtFiles.masterConfig, content: JSON.stringify({ schemaVersion: "1.0.0" }, null, 2) },
  { path: paths.txtFiles.users, content: JSON.stringify(initialUsersForSite(site), null, 2) },
  { path: paths.txtFiles.events, content: JSON.stringify({ displayCount: 3, displayMode: "default", events: [] }, null, 2) },
  { path: paths.txtFiles.navigation, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.siteContent, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.theme, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.widgets, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.externalLinks, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.gantt, content: JSON.stringify([], null, 2) }
];

const resolvePathsForSite = (site: Site): SiteBuilderResolvedPaths => {
  const generated = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget,
    runtimeConfigPath: site.runtimeConfigPath
  });
  if (!generated) throw new Error("sharepoint-paths-missing");
  const stored = site.resolvedPaths || {};
  return {
    ...generated,
    ...stored,
    host: stored.host || generated.host,
    siteRoot: stored.siteRoot || generated.siteRoot,
    sharePointSiteUrl: stored.sharePointSiteUrl || site.sharePointSiteUrl || generated.sharePointSiteUrl,
    txtFiles: {
      ...generated.txtFiles,
      ...(stored.txtFiles || {})
    }
  };
};

const fileNameFromPath = (path: string) => path.split("/").filter(Boolean).pop() || "file.txt";

const parentFolder = (path: string) => {
  const normalized = String(path || "").replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).slice(0, -1).join("/");
};

const escapeODataString = (value: string) => value.replace(/'/g, "''");

const responseTextSafe = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const summarizeError = (value: string) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 260);

const payloadData = (payload: any) => payload?.d || payload;

const sha256Hex = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const pushStep = (steps: StepEvidence[], step: StepEvidence) => {
  steps.push(step);
};

const txtMigrationSources = (paths: SiteBuilderResolvedPaths) => [
  { logicalName: "masterConfig", path: paths.txtFiles.masterConfig },
  { logicalName: "users", path: paths.txtFiles.users },
  { logicalName: "events", path: paths.txtFiles.events },
  { logicalName: "navigation", path: paths.txtFiles.navigation },
  { logicalName: "siteContent", path: paths.txtFiles.siteContent },
  { logicalName: "theme", path: paths.txtFiles.theme },
  { logicalName: "widgets", path: paths.txtFiles.widgets },
  { logicalName: "externalLinks", path: paths.txtFiles.externalLinks },
  { logicalName: "gantt", path: paths.txtFiles.gantt }
].filter((item) => item.path);

const parseJsonForMigration = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return { parseStatus: "empty" as const, data: undefined, error: "empty-txt-file" };
  try {
    return { parseStatus: "json" as const, data: JSON.parse(trimmed), error: "" };
  } catch (error) {
    return {
      parseStatus: "invalid-json" as const,
      data: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export async function readBrowserTxtSnapshotForMongoMigration(site: Site): Promise<TxtToMongoMigrationInput> {
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const files: TxtToMongoMigrationInput["files"] = [];

  for (const source of txtMigrationSources(paths)) {
    const result = await readFileForBrowserOperation(targetSiteUrl, source.path);
    if (!result.ok || !result.bytes) {
      files.push({
        key: fileNameFromPath(source.path),
        fileName: fileNameFromPath(source.path),
        logicalName: source.logicalName,
        sourcePath: source.path,
        url: result.url,
        exists: false,
        status: result.status === 404 ? "missing" : "failed",
        httpStatus: result.status,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
        parseStatus: result.status === 404 ? "missing" : "failed",
        error: result.error || `txt-read-failed:${result.status || "unknown"}`
      });
      continue;
    }

    const text = new TextDecoder().decode(result.bytes);
    const parsed = parseJsonForMigration(text);
    files.push({
      key: fileNameFromPath(source.path),
      fileName: fileNameFromPath(source.path),
      logicalName: source.logicalName,
      sourcePath: source.path,
      url: result.url,
      exists: true,
      status: parsed.parseStatus === "json" ? "read" : "failed",
      httpStatus: result.status,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
      data: parsed.data,
      parseStatus: parsed.parseStatus,
      error: parsed.error
    });
  }

  return {
    connectorMode: "browser-sharepoint",
    sourceSharePointSiteUrl: targetSiteUrl,
    capturedAt: new Date().toISOString(),
    overwriteMongo: true,
    switchSiteToMongo: true,
    files
  };
}

export async function runBrowserMongoRuntimeConfigUpload(
  site: Site,
  runtimeConfig: MongoRuntimeConfigContent
): Promise<MongoCreateBrowserEvidenceInput> {
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const steps: StepEvidence[] = [];
  const runtimeConfigPath = runtimeConfig.runtimeConfigPath || site.runtimeConfigPath || paths.runtimeConfigPath;

  try {
    await requestDigestForBrowserOperation(targetSiteUrl);
    pushStep(steps, { step: "runtime-config-request-digest", status: "succeeded", path: targetSiteUrl });

    const runtimeFolder = parentFolder(runtimeConfigPath);
    if (runtimeFolder) {
      await ensureSharePointFolderHierarchyBrowser(paths, runtimeFolder);
      pushStep(steps, { step: "runtime-config-folder", status: "succeeded", path: runtimeFolder });
    }

    const encoded = new TextEncoder().encode(runtimeConfig.content);
    const upload = await uploadBinaryFileForBrowserOperation({
      targetSiteUrl,
      targetPath: runtimeConfigPath,
      relativePath: fileNameFromPath(runtimeConfigPath),
      body: encoded,
      contentType: runtimeConfig.contentType,
      expectedSizeBytes: runtimeConfig.sizeBytes,
      expectedSha256: runtimeConfig.sha256
    });
    if (upload.status !== "uploaded") {
      pushStep(steps, { step: "upload-runtime-config", status: "failed", path: runtimeConfigPath, httpStatus: upload.httpStatus, error: upload.error });
      throw new Error(upload.error || "runtime-config-upload-failed");
    }
    pushStep(steps, { step: "upload-runtime-config", status: "succeeded", path: runtimeConfigPath, httpStatus: upload.httpStatus });

    const readBack = await readFileForBrowserOperation(targetSiteUrl, runtimeConfigPath);
    const readBackText = readBack.bytes ? new TextDecoder().decode(readBack.bytes) : "";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = readBackText ? JSON.parse(readBackText) : {};
    } catch {
      parsed = {};
    }
    const expectedBackendApiUrl = String(runtimeConfig.redactedPreview.backendApiUrl || "");
    const expectedSiteId = String(runtimeConfig.redactedPreview.siteId || "");
    const verified = Boolean(
      readBack.ok &&
      parsed.storageBackend === "mongo" &&
      String(parsed.backendApiUrl || "") === expectedBackendApiUrl &&
      String(parsed.siteId || "") === expectedSiteId &&
      Boolean(parsed.apiKey)
    );
    pushStep(steps, {
      step: "verify-runtime-config-readback",
      status: verified ? "succeeded" : "failed",
      path: runtimeConfigPath,
      httpStatus: readBack.status,
      error: verified ? undefined : readBack.error || "runtime-config-readback-invalid"
    });

    return {
      connectorMode: "browser-sharepoint",
      targetSharePointSiteUrl: targetSiteUrl,
      capturedAt: new Date().toISOString(),
      steps,
      runtimeConfig: {
        path: runtimeConfigPath,
        uploaded: upload.status === "uploaded",
        verified,
        storageBackend: "mongo",
        backendApiUrlHost: expectedBackendApiUrl,
        siteId: expectedSiteId,
        apiKeyConfigured: Boolean(parsed.apiKey)
      },
      hosting: {
        siteDbRootReady: true,
        usersDbRootReady: true,
        finalDistRootReady: true,
        siteAssetsRootReady: true,
        assetsFolderReady: true,
        indexHtmlVerified: false
      },
      warnings: verified
        ? ["runtime config הועלה ואומת. כדי להשלים Cutover צריך לפרוס Release תואם Mongo."]
        : ["runtime config הועלה אבל אימות קריאה חזרה נכשל."]
    };
  } catch (error) {
    if (!steps.some((step) => step.status === "failed")) {
      pushStep(steps, {
        step: "browser-sharepoint-runtime-config",
        status: "failed",
        path: runtimeConfigPath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return {
      connectorMode: "browser-sharepoint",
      targetSharePointSiteUrl: targetSiteUrl,
      capturedAt: new Date().toISOString(),
      steps,
      runtimeConfig: {
        path: runtimeConfigPath,
        uploaded: false,
        verified: false,
        storageBackend: "mongo",
        backendApiUrlHost: String(runtimeConfig.redactedPreview.backendApiUrl || ""),
        siteId: String(runtimeConfig.redactedPreview.siteId || ""),
        apiKeyConfigured: false
      },
      hosting: {
        siteDbRootReady: false,
        usersDbRootReady: false,
        finalDistRootReady: false,
        siteAssetsRootReady: false,
        assetsFolderReady: false,
        indexHtmlVerified: false
      },
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  }
}

const pushRunnerStep = (
  steps: BrowserSharePointOperationStepEvidence[],
  input: Omit<BrowserSharePointOperationStepEvidence, "checkedAt">
) => {
  steps.push({ ...input, checkedAt: new Date().toISOString() });
};

const operationPayload = (
  operation: BrowserSiteOperationEvidencePayload["operation"],
  site: Site,
  paths: SiteBuilderResolvedPaths,
  startedAt: string,
  steps: StepEvidence[],
  warnings: string[] = []
): BrowserSiteOperationEvidencePayload => {
  const failed = steps.filter((step) => step.status === "failed");
  const siteDbOk = steps.some((step) => step.step.includes("site-db") && step.status !== "failed");
  const usersDbOk = steps.some((step) => step.step.includes("users-db") && step.status !== "failed");
  const distOk = steps.some((step) => step.step.includes("dist") && step.status !== "failed");
  const assetsOk = steps.some((step) => (step.step.includes("assets") || step.step.includes("images")) && step.status !== "failed");
  const txtOk = steps.some((step) => step.step.includes("txt") && step.status !== "failed");
  const permissionsOk = operation === "permissions-setup"
    ? steps.length > 0 && failed.length === 0
    : steps.some((step) => step.step.includes("permissions") && step.status !== "failed");
  return {
    connectorMode: "browser-sharepoint",
    operation,
    targetSiteUrl: normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl),
    startedAt,
    completedAt: new Date().toISOString(),
    finalStatus: failed.length ? "failed" : "success",
    steps,
    health: {
      siteDbExists: siteDbOk,
      usersDbExists: usersDbOk,
      distExists: distOk,
      assetsExists: assetsOk,
      txtFilesExist: txtOk,
      permissionsOk
    },
    evidence: { resolvedPaths: paths },
    warnings
  };
};

export async function runBrowserSharePointProvisionOperation(site: Site): Promise<BrowserSiteOperationEvidencePayload> {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const steps: StepEvidence[] = [];

  try {
    await requestDigestForBrowserOperation(targetSiteUrl);
    pushStep(steps, { step: "sharepoint-request-digest", status: "succeeded", path: targetSiteUrl });

    const siteDb = await ensureSharePointDocumentLibraryBrowser(paths, paths.siteDbLibrary, paths.siteDbRoot);
    pushStep(steps, { step: "sharepoint-library-site-db", status: "succeeded", path: paths.siteDbRoot, httpStatus: siteDb.httpStatus });

    if (paths.usersDbRoot === paths.siteDbRoot) {
      pushStep(steps, { step: "sharepoint-library-users-db", status: "skipped", path: paths.usersDbRoot });
    } else {
      const usersDb = await ensureSharePointDocumentLibraryBrowser(paths, paths.usersDbLibrary, paths.usersDbRoot);
      pushStep(steps, { step: "sharepoint-library-users-db", status: "succeeded", path: paths.usersDbRoot, httpStatus: usersDb.httpStatus });
    }

    for (const [step, folder] of [
      ["sharepoint-folder-site-assets", paths.siteAssetsRoot],
      ["sharepoint-folder-images", paths.imagesRoot],
      ["sharepoint-folder-dist", paths.finalDistRoot],
      ["sharepoint-folder-dist-assets", `${paths.finalDistRoot}/assets`]
    ] as const) {
      await ensureSharePointFolderHierarchyBrowser(paths, folder);
      pushStep(steps, { step, status: "succeeded", path: folder });
    }

    for (const file of defaultTxtSeedFiles(site, paths)) {
      const result = await ensureSharePointTextFileIfMissingBrowser({ paths, targetPath: file.path, content: file.content });
      if (result.status === "failed") throw new Error(result.error || `txt-seed-file-failed:${file.path}`);
      pushStep(steps, { step: "txt-seed-file", status: "succeeded", path: file.path, httpStatus: result.httpStatus });
    }
  } catch (error) {
    pushStep(steps, {
      step: "browser-sharepoint-provision",
      status: "failed",
      path: targetSiteUrl,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return operationPayload("site-provision", site, paths, startedAt, steps);
}

async function readAssociatedMemberGroupId(targetSiteUrl: string) {
  const response = await fetch(buildSharePointApiUrl(targetSiteUrl, "/_api/web/associatedmembergroup?$select=Id,Title"), {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json;odata=verbose" }
  });
  if (!response.ok) {
    const text = await responseTextSafe(response);
    throw new Error(text ? summarizeError(text) : `associated-member-group-read-failed:${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  const data = payloadData(payload);
  const id = Number(data?.Id || data?.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("associated-member-group-missing");
  return id;
}

async function postSharePointNoBody(targetSiteUrl: string, suffix: string, digest: string) {
  const response = await fetch(buildSharePointApiUrl(targetSiteUrl, suffix), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json;odata=verbose",
      "X-RequestDigest": digest
    }
  });
  if (!response.ok) {
    const text = await responseTextSafe(response);
    throw new Error(text ? summarizeError(text) : `sharepoint-post-failed:${response.status}`);
  }
  return response.status;
}

export async function runBrowserSharePointPermissionsOperation(site: Site): Promise<BrowserSiteOperationEvidencePayload> {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const steps: StepEvidence[] = [];

  try {
    const digest = await requestDigestForBrowserOperation(targetSiteUrl);
    pushStep(steps, { step: "permissions-request-digest", status: "succeeded", path: targetSiteUrl });
    await ensureSharePointFolderHierarchyBrowser(paths, paths.usersDbRoot);
    pushStep(steps, { step: "permissions-folder-users-db", status: "succeeded", path: paths.usersDbRoot });

    const groupId = await readAssociatedMemberGroupId(targetSiteUrl);
    pushStep(steps, { step: "permissions-associated-member-group", status: "succeeded", path: targetSiteUrl });

    const escapedUsersDbRoot = escapeODataString(paths.usersDbRoot);
    const breakStatus = await postSharePointNoBody(
      targetSiteUrl,
      `/_api/web/GetFolderByServerRelativeUrl('${escapedUsersDbRoot}')/ListItemAllFields/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
      digest
    );
    pushStep(steps, { step: "permissions-break-inheritance", status: "succeeded", path: paths.usersDbRoot, httpStatus: breakStatus });

    const addStatus = await postSharePointNoBody(
      targetSiteUrl,
      `/_api/web/GetFolderByServerRelativeUrl('${escapedUsersDbRoot}')/ListItemAllFields/roleassignments/addroleassignment(principalid=${groupId},roledefid=1073741827)`,
      digest
    );
    pushStep(steps, { step: "permissions-add-members-contribute", status: "succeeded", path: paths.usersDbRoot, httpStatus: addStatus });

    const marker = JSON.stringify({
      connectorMode: "browser-sharepoint",
      operation: "permissions-setup",
      siteId: site._id,
      siteCode: site.siteCode,
      groupId,
      checkedAt: new Date().toISOString()
    }, null, 2);
    await writeTextFileForBrowserOperation({ targetSiteUrl, targetPath: paths.permissionsMarkerFile, text: marker });
    pushStep(steps, { step: "permissions-marker-txt", status: "succeeded", path: paths.permissionsMarkerFile });
  } catch (error) {
    pushStep(steps, {
      step: "browser-sharepoint-permissions",
      status: "failed",
      path: paths.usersDbRoot,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return operationPayload("permissions-setup", site, paths, startedAt, steps);
}

export async function runBrowserSharePointBootstrapOperation(site: Site): Promise<BrowserSiteOperationEvidencePayload> {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const provision = await runBrowserSharePointProvisionOperation(site);
  const steps = [...(provision.steps || [])];
  if (provision.finalStatus === "success") {
    const permissions = await runBrowserSharePointPermissionsOperation(site);
    steps.push(...(permissions.steps || []));
  }
  const payload = operationPayload("site-bootstrap", site, paths, startedAt, steps, [
    "Bootstrap combines browser provisioning and browser permissions setup."
  ]);
  payload.evidence = {
    ...(payload.evidence || {}),
    provisionStatus: provision.finalStatus
  };
  return payload;
}

const restoreFilesFromBackup = (backup: Backup, plan?: BrowserRestoreOperationPlan) => {
  if (plan?.files?.length) return plan.files;
  const evidence = backup.verification?.evidence || [];
  if (evidence.length) {
    return evidence.map((row) => ({
      backupPath: row.targetPath,
      sourcePath: row.sourcePath,
      targetPath: row.sourcePath,
      expectedSizeBytes: row.backupSizeBytes || row.expectedBackupSizeBytes || row.sourceSizeBytes,
      expectedSha256: row.backupSha256 || row.expectedBackupSha256 || row.sourceSha256
    }));
  }
  return (backup.sourcePaths || []).map((row) => ({
    backupPath: row.targetPath,
    sourcePath: row.path,
    targetPath: row.path,
    expectedSizeBytes: row.backupSizeBytes || row.sourceSizeBytes,
    expectedSha256: row.backupSha256 || row.sourceSha256
  }));
};

const failedRestoreEvidence = (file: ReturnType<typeof restoreFilesFromBackup>[number], error: unknown): BackupRestoreEvidence => ({
  sourcePath: file.sourcePath,
  targetPath: file.targetPath || file.sourcePath,
  backupPath: file.backupPath || file.sourcePath,
  status: "failed",
  checkedAt: new Date().toISOString(),
  expectedBackupSizeBytes: file.expectedSizeBytes || 0,
  expectedBackupSha256: file.expectedSha256 || "",
  backupSizeBytes: 0,
  backupSha256: "",
  expectedRestoreSizeBytes: file.expectedSizeBytes || 0,
  expectedRestoreSha256: file.expectedSha256 || "",
  restoredSizeBytes: 0,
  restoredSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  error: error instanceof Error ? error.message : String(error)
});

const restoreEvidenceFromReadBack = (
  file: ReturnType<typeof restoreFilesFromBackup>[number],
  readBack: DeploymentVerificationEvidence,
  sourceSizeBytes?: number,
  sourceSha256?: string
): BackupRestoreEvidence => ({
  sourcePath: file.sourcePath,
  targetPath: file.targetPath || file.sourcePath,
  backupPath: file.backupPath || file.sourcePath,
  status: readBack.status,
  checkedAt: readBack.checkedAt,
  expectedBackupSizeBytes: file.expectedSizeBytes || sourceSizeBytes || 0,
  expectedBackupSha256: file.expectedSha256 || sourceSha256 || "",
  backupSizeBytes: sourceSizeBytes || 0,
  backupSha256: sourceSha256 || "",
  expectedRestoreSizeBytes: file.expectedSizeBytes || sourceSizeBytes || 0,
  expectedRestoreSha256: file.expectedSha256 || sourceSha256 || "",
  restoredSizeBytes: readBack.actualSizeBytes || 0,
  restoredSha256: readBack.actualSha256 || "",
  sizeMatches: readBack.sizeMatches,
  sha256Matches: readBack.sha256Matches,
  httpStatus: readBack.httpStatus,
  httpStatusText: readBack.httpStatusText,
  contentType: readBack.contentType,
  etag: readBack.etag,
  lastModified: readBack.lastModified,
  error: readBack.error
});

export async function runBrowserSharePointRestoreOperation(site: Site, backup: Backup, plan?: BrowserRestoreOperationPlan) {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(plan?.targetSiteUrl || paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const files = restoreFilesFromBackup(backup, plan).filter((file) => file.backupPath && (file.targetPath || file.sourcePath));
  const restoreEvidence: BackupRestoreEvidence[] = [];
  const errors: Array<{ sourcePath?: string; targetPath?: string; backupPath?: string; error: string; status?: number }> = [];
  const steps: BrowserSharePointOperationStepEvidence[] = [];

  try {
    await requestDigestForBrowserOperation(targetSiteUrl);
    pushRunnerStep(steps, { step: "restore-request-digest", status: "succeeded", targetSiteUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushRunnerStep(steps, { step: "restore-request-digest", status: "failed", targetSiteUrl, error: message });
    return {
      connectorMode: "browser-sharepoint" as const,
      targetSiteUrl,
      restoreEvidence,
      errors: [{ error: message }],
      steps,
      startedAt,
      completedAt: new Date().toISOString(),
      finalStatus: "failed" as const
    };
  }

  for (const file of files) {
    try {
      const backupPath = file.backupPath || file.sourcePath;
      const targetPath = file.targetPath || file.sourcePath;
      const source = await readFileForBrowserOperation(targetSiteUrl, backupPath);
      if (!source.ok || !source.bytes) throw new Error(source.error || `browser-restore-read-backup-failed:${source.status || "unknown"}`);
      pushRunnerStep(steps, { step: "restore-read-backup-file", status: "succeeded", targetSiteUrl, path: backupPath, httpStatus: source.status });

      await ensureSharePointFolderHierarchyBrowser(paths, `/${parentFolder(targetPath)}`);
      const upload = await uploadBinaryFileForBrowserOperation({
        targetSiteUrl,
        targetPath,
        relativePath: fileNameFromPath(targetPath),
        body: source.bytes,
        contentType: source.contentType || "application/octet-stream",
        expectedSizeBytes: file.expectedSizeBytes || source.sizeBytes,
        expectedSha256: file.expectedSha256 || source.sha256
      });
      if (upload.status !== "uploaded") throw new Error(upload.error || `browser-restore-upload-failed:${upload.httpStatus || "unknown"}`);
      pushRunnerStep(steps, { step: "restore-upload-live-file", status: "succeeded", targetSiteUrl, path: targetPath, httpStatus: upload.httpStatus });

      const readBack = await readBackVerifyForBrowserOperation({
        targetSiteUrl,
        targetPath,
        relativePath: fileNameFromPath(targetPath),
        expectedSizeBytes: file.expectedSizeBytes || source.sizeBytes,
        expectedSha256: file.expectedSha256 || source.sha256
      });
      const evidence = restoreEvidenceFromReadBack(file, readBack, source.sizeBytes, source.sha256);
      restoreEvidence.push(evidence);
      if (evidence.status === "verified" && evidence.sizeMatches && evidence.sha256Matches) {
        pushRunnerStep(steps, { step: "restore-read-back-verify", status: "succeeded", targetSiteUrl, path: targetPath, httpStatus: evidence.httpStatus });
      } else {
        const message = evidence.error || "browser-restore-readback-mismatch";
        errors.push({ sourcePath: file.sourcePath, targetPath, backupPath, error: message, status: evidence.httpStatus });
        pushRunnerStep(steps, { step: "restore-read-back-verify", status: "failed", targetSiteUrl, path: targetPath, httpStatus: evidence.httpStatus, error: message });
      }
    } catch (error) {
      const failed = failedRestoreEvidence(file, error);
      restoreEvidence.push(failed);
      errors.push({
        sourcePath: file.sourcePath,
        targetPath: file.targetPath || file.sourcePath,
        backupPath: file.backupPath || file.sourcePath,
        error: failed.error || "browser-restore-file-failed",
        status: failed.httpStatus
      });
      pushRunnerStep(steps, {
        step: "restore-file",
        status: "failed",
        targetSiteUrl,
        path: file.targetPath || file.sourcePath,
        error: failed.error
      });
    }
  }

  const finalStatus: "success" | "failed" = restoreEvidence.length === files.length && restoreEvidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches)
    ? "success"
    : "failed";
  return {
    connectorMode: "browser-sharepoint" as const,
    targetSiteUrl,
    restoreEvidence,
    errors,
    steps,
    startedAt,
    completedAt: new Date().toISOString(),
    finalStatus
  };
}

export async function runBrowserAdminTxtRepairOperation(site: Site, plan: AdminTxtRepairPlan, reason = "") {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const targetPath = plan.targetPath || paths.txtFiles.users;
  const text = `${JSON.stringify(plan.mergedTxtAdmins || [], null, 2)}\n`;
  const expectedSha256 = await sha256Hex(text);
  const errors: Array<{ sourcePath?: string; targetPath?: string; error: string; status?: number }> = [];
  let repairEvidence: DeploymentVerificationEvidence | undefined;

  try {
    await requestDigestForBrowserOperation(targetSiteUrl);
    await ensureSharePointFolderHierarchyBrowser(paths, `/${parentFolder(targetPath)}`);
    const upload = await writeTextFileForBrowserOperation({
      targetSiteUrl,
      targetPath,
      text,
      expectedSha256
    });
    if (upload.status !== "uploaded") throw new Error(upload.error || `admin-txt-repair-upload-failed:${upload.httpStatus || "unknown"}`);
    repairEvidence = await readBackVerifyForBrowserOperation({
      targetSiteUrl,
      targetPath,
      relativePath: fileNameFromPath(targetPath),
      expectedSizeBytes: new TextEncoder().encode(text).byteLength,
      expectedSha256
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ targetPath, error: message });
    repairEvidence = {
      relativePath: fileNameFromPath(targetPath),
      sourcePath: `browser-admin-txt-repair:${targetPath}`,
      targetPath,
      status: "failed",
      checkedAt: new Date().toISOString(),
      expectedSizeBytes: new TextEncoder().encode(text).byteLength,
      actualSizeBytes: 0,
      expectedSha256,
      actualSha256: "",
      sizeMatches: false,
      sha256Matches: false,
      error: message
    };
  }

  if (!repairEvidence) {
    repairEvidence = {
      relativePath: fileNameFromPath(targetPath),
      sourcePath: `browser-admin-txt-repair:${targetPath}`,
      targetPath,
      status: "failed",
      checkedAt: new Date().toISOString(),
      expectedSizeBytes: new TextEncoder().encode(text).byteLength,
      actualSizeBytes: 0,
      expectedSha256,
      actualSha256: "",
      sizeMatches: false,
      sha256Matches: false,
      error: "admin-txt-repair-evidence-missing"
    };
  }
  const finalStatus: "success" | "failed" = repairEvidence.status === "verified" && repairEvidence.sizeMatches && repairEvidence.sha256Matches ? "success" : "failed";
  return {
    connectorMode: "browser-sharepoint" as const,
    targetSiteUrl,
    targetPath,
    mergedTxtAdmins: plan.mergedTxtAdmins || [],
    repairEvidence,
    errors,
    startedAt,
    completedAt: new Date().toISOString(),
    finalStatus,
    reason
  };
}
