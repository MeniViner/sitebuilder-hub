import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, PackageCheck, Plus, Rocket, RotateCcw, ServerOff } from "lucide-react";
import { DeployPlan, DeployTargetInventoryFile, OperationCapabilities, Release, ReleaseArtifactValidation, RollbackPlan, sitesApi } from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { formatBytes, formatDateTime, formatNumber, releaseTypeLabel } from "../utils/format";

const rollbackRiskLabel = (risk: string) => {
  const labels: Record<string, string> = {
    "Rollback overwrites live SharePoint dist files with the selected older release artifact.": "Rollback ידרוס את קבצי ה־dist החיים ב־SharePoint באמצעות artifact של גרסה ישנה יותר.",
    "Rollback does not mirror-delete files that are absent from the rollback artifact.": "Rollback לא מוחק במראה קבצים שאינם קיימים ב־artifact של גרסת היעד.",
    "Rollback should be approved only after confirming recent backup or restore evidence.": "יש לאשר Rollback רק אחרי אימות גיבוי או evidence שחזור עדכני."
  };
  return labels[risk] || risk;
};

const hasNumber = (value?: number | null): value is number =>
  typeof value === "number" && Number.isFinite(value);

const targetFileLabel = (file: DeployTargetInventoryFile) =>
  file.relativePath || file.path || file.name || file.targetPath || file.serverRelativeUrl || file.url || "-";

const targetFileKey = (file: DeployTargetInventoryFile, index: number) =>
  `${targetFileLabel(file)}-${file.etag || file.sha256 || index}`;

const staleReasonLabel = (file: DeployTargetInventoryFile) =>
  file.staleReason || file.reason || file.policy || file.status || "stale";

function DeployTargetInventoryPanel({ plan }: { plan: DeployPlan }) {
  const inventory = plan.targetInventory;
  const inventoryFiles = inventory?.files || [];
  const staleFiles = plan.staleTargetFiles || [];
  const summary = inventory?.summary;
  const displayFiles = staleFiles.length ? staleFiles : inventoryFiles.slice(0, 12);

  if (!inventory && staleFiles.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard title="Target inventory" value={formatNumber(summary?.filesCount ?? summary?.existingFilesCount ?? inventoryFiles.length)} icon={<PackageCheck size={18} />} tone={summary?.readOk === false ? "warning" : "info"} />
        <KpiCard title="Target size" value={hasNumber(summary?.knownSizeBytes) ? formatBytes(summary.knownSizeBytes) : "-"} icon={<PackageCheck size={18} />} tone="neutral" />
        <KpiCard title="Stale files" value={formatNumber(summary?.staleFilesCount ?? staleFiles.length)} icon={<AlertTriangle size={18} />} tone={(summary?.staleFilesCount ?? staleFiles.length) ? "warning" : "success"} />
        <KpiCard title="Policy" value={summary?.mirrorDeleteEnabled ? "Mirror delete" : summary?.staleFilePolicy || "Keep"} icon={<AlertTriangle size={18} />} tone={summary?.mirrorDeleteEnabled ? "warning" : "neutral"} />
      </div>

      <div className="rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
        <div className="grid gap-2 md:grid-cols-2">
          <LinkRow label="Inventory root" value={inventory?.targetRoot || inventory?.distRoot || inventory?.serverRelativePath} />
          <LinkRow label="Inventory URL" value={inventory?.url} isUrl />
        </div>
        {inventory?.generatedAt ? <p className="num mt-2 text-xs muted">נבדק: {formatDateTime(inventory.generatedAt)}</p> : null}
        {summary?.authBlocked ? <div className="mt-3 badge badge-warning">Inventory read blocked by auth</div> : null}
      </div>

      <DataTable columns={staleFiles.length ? ["קובץ מיושן", "Target", "גודל", "עודכן", "סיבה"] : ["קובץ ביעד", "Target", "גודל", "עודכן", "סטטוס"]} minWidth={980}>
        {displayFiles.length === 0 ? (
          <tr><td colSpan={5}><EmptyState title="אין קבצי יעד להצגה" description="ה־API לא החזיר רשימת inventory או stale files." /></td></tr>
        ) : displayFiles.map((file, index) => (
          <tr key={targetFileKey(file, index)}>
            <td>
              <p className="font-bold">{targetFileLabel(file)}</p>
              {file.sha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={file.sha256}>{file.sha256}</code> : null}
            </td>
            <td><code className="num block max-w-[360px] truncate text-xs muted" title={file.targetPath || file.serverRelativeUrl || file.url}>{file.targetPath || file.serverRelativeUrl || file.url || "-"}</code></td>
            <td className="num text-xs">{hasNumber(file.sizeBytes) ? formatBytes(file.sizeBytes) : "-"}</td>
            <td className="num text-xs">{formatDateTime(file.lastModified || file.timeLastModified)}</td>
            <td>
              <span className={`badge ${staleFiles.length ? "badge-warning" : file.error ? "badge-danger" : "badge-neutral"}`}>
                {staleFiles.length ? staleReasonLabel(file) : file.error || file.status || (file.exists === false ? "missing" : "exists")}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      {inventory?.notes?.length ? (
        <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
          <p className="field-label">Inventory notes</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {inventory.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [releaseType, setReleaseType] = useState("patch");
  const [notes, setNotes] = useState("");
  const [artifactRef, setArtifactRef] = useState("");
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [versionStatus, setVersionStatus] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<OperationCapabilities | null>(null);
  const [deployPlan, setDeployPlan] = useState<DeployPlan | null>(null);
  const [rollbackPlan, setRollbackPlan] = useState<RollbackPlan | null>(null);
  const [artifactValidation, setArtifactValidation] = useState<ReleaseArtifactValidation | null>(null);
  const [busyAction, setBusyAction] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [relRes, sitesRes, statusRes, capsRes] = await Promise.all([
        sitesApi.releases(),
        sitesApi.list(),
        sitesApi.versionStatus(),
        sitesApi.operationCapabilities()
      ]);
      setReleases(relRes.data);
      setSites(sitesRes.data);
      setVersionStatus(statusRes.data);
      setCapabilities(capsRes.data);
      if (!selectedReleaseId && relRes.data[0]) setSelectedReleaseId(relRes.data[0]._id);
      if (!selectedSiteId && sitesRes.data[0]) setSelectedSiteId(sitesRes.data[0]._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת מרכז גרסאות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const latestRelease = releases[0];
  const writeAvailable = Boolean(capabilities?.sharePoint.writeAvailable);
  const outdatedSites = useMemo(() => (versionStatus?.sites || []).filter((row: any) => row.status === "outdated"), [versionStatus]);
  const versionGroups = useMemo(() => {
    const rows = versionStatus?.sites || [];
    const groups = new Map<string, number>();
    rows.forEach((row: any) => groups.set(row.currentVersion || "לא ידוע", (groups.get(row.currentVersion || "לא ידוע") || 0) + 1));
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [versionStatus]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בביצוע פעולה");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="גרסאות ופריסות"
        subtitle="ניהול release registry, תכנון פריסה, וביצוע deploy רק כאשר SharePoint write מוגדר; כל קובץ נקרא חזרה ומאומת לפני סימון הצלחה."
        actions={writeAvailable ? <span className="badge badge-success">SharePoint deploy מחובר</span> : <MetadataOnlyBadge mode="notConnected" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Latest release" value={versionStatus?.latestVersion || latestRelease?.version || "-"} icon={<PackageCheck size={18} />} description="גרסה אחרונה ב־release registry" tone="info" />
            <KpiCard title="אתרים מיושנים" value={formatNumber(versionStatus?.outdatedSites || 0)} icon={<GitBranch size={18} />} description="מבוסס על currentVersion ב־Mongo" tone={(versionStatus?.outdatedSites || 0) ? "warning" : "success"} />
            <KpiCard title="אתרים מנוהלים" value={formatNumber(versionStatus?.totalSites || sites.length)} icon={<CheckCircle2 size={18} />} description="אתרים שאינם בארכיון" tone="neutral" />
            <KpiCard title="מצב פריסה" value={writeAvailable ? "מחובר" : "לא מחובר"} icon={writeAvailable ? <Rocket size={18} /> : <ServerOff size={18} />} description={writeAvailable ? "ניתן להריץ deploy אמיתי" : "Deploy execution חסום; ניתן לתכנן בלבד"} tone={writeAvailable ? "success" : "warning"} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard title="יצירת Release" subtitle="יצירת release היא פעולה ניהולית ב־Hub. פריסה ל־SharePoint דורשת artifact ו־write capability.">
              <div className="mb-4 flex flex-wrap gap-2">
                <MetadataOnlyBadge mode="metadata" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="field-label">גרסה</span>
                  <input className="control" placeholder="לדוגמה: 1.4.2" value={newVersion} onChange={(e) => setNewVersion(e.target.value)} />
                </label>
                <label className="block">
                  <span className="field-label">סוג Release</span>
                  <select className="control" value={releaseType} onChange={(e) => setReleaseType(e.target.value)}>
                    <option value="patch">Patch</option>
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="hotfix">Hotfix</option>
                  </select>
                </label>
                <label className="block md:col-span-2">
                  <span className="field-label">Artifact reference</span>
                  <input className="control" placeholder="נתיב לתיקיית dist או manifest" value={artifactRef} onChange={(e) => setArtifactRef(e.target.value)} />
                </label>
                <label className="block md:col-span-2">
                  <span className="field-label">הערות</span>
                  <textarea className="control min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
              <button
                className="btn btn-primary mt-4"
                disabled={busyAction === "create-release"}
                onClick={() => runAction("create-release", async () => {
                  await sitesApi.createRelease({ version: newVersion || undefined, releaseType, notes: notes || undefined, artifactRef: artifactRef || undefined });
                  setMessage("Release נוצר ב־Hub");
                  setNewVersion("");
                  setNotes("");
                  setArtifactRef("");
                  await load();
                })}
                type="button"
              >
                <Plus size={16} />
                צור Release
              </button>
            </SectionCard>

            <SectionCard title="תכנון וביצוע פריסה" subtitle="Plan הוא read-only. ביצוע deploy אמיתי חסום אם SharePoint write לא מוגדר, ושומר evidence של sha256/size לאחר upload.">
              <div className="mb-4 flex flex-wrap gap-2">
                <MetadataOnlyBadge mode="readonly" />
                {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="field-label">Release</span>
                  <select className="control" value={selectedReleaseId} onChange={(e) => { setSelectedReleaseId(e.target.value); setDeployPlan(null); setRollbackPlan(null); setArtifactValidation(null); }}>
                    {releases.map((release) => <option key={release._id} value={release._id}>{release.version} · {releaseTypeLabel(release.releaseType)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">אתר יעד</span>
                  <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setDeployPlan(null); setRollbackPlan(null); }}>
                    {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={!selectedReleaseId || !selectedSiteId || busyAction === "deploy-plan"} onClick={() => runAction("deploy-plan", async () => {
                  const result = await sitesApi.deploySiteVersionPlan(selectedSiteId, selectedReleaseId);
                  setDeployPlan(result.data);
                  setRollbackPlan(null);
                  setMessage("תוכנית פריסה נוצרה");
                })} type="button">Plan לאתר נבחר</button>
                <button className="btn btn-secondary" disabled={!selectedReleaseId || busyAction === "artifact-validate"} onClick={() => runAction("artifact-validate", async () => {
                  const result = await sitesApi.validateReleaseArtifact(selectedReleaseId);
                  setArtifactValidation(result.data);
                  setMessage("Artifact נבדק מקומית");
                })} type="button">בדוק Artifact</button>
                <button className="btn btn-secondary" disabled={!writeAvailable || !selectedReleaseId || busyAction === "deploy-all"} onClick={() => runAction("deploy-all", async () => {
                  const result = await sitesApi.deployReleaseAll(selectedReleaseId, false);
                  setMessage(`נוצרו ${result.data.queuedJobs} jobs לפריסת כל האתרים`);
                  await load();
                })} type="button">Deploy לכל האתרים</button>
                <button className="btn btn-secondary" disabled={!writeAvailable || !selectedReleaseId || busyAction === "deploy-outdated"} onClick={() => runAction("deploy-outdated", async () => {
                  const result = await sitesApi.deployReleaseAll(selectedReleaseId, true);
                  setMessage(`נוצרו ${result.data.queuedJobs} jobs לאתרים מיושנים`);
                  await load();
                })} type="button">Deploy למיושנים</button>
                <button className="btn btn-secondary" disabled={!writeAvailable || !selectedReleaseId || !selectedSiteId || busyAction === "deploy-one"} onClick={() => runAction("deploy-one", async () => {
                  const result = await sitesApi.deploySiteVersion(selectedSiteId, selectedReleaseId);
                  const evidenceCount = result.data.deployment?.verification?.evidence?.length || 0;
                  const approvalText = result.data.requiresApproval ? ` · ${result.data.approvalStatus || "ממתין לאישור"}` : "";
                  const evidenceText = evidenceCount ? ` · ${formatNumber(evidenceCount)} evidence rows` : "";
                  setMessage(`${result.data.message || `נוצר Job לפריסה: ${result.data.job._id}`}${approvalText}${evidenceText}`);
                  await load();
                })} type="button">Deploy אתר נבחר</button>
              </div>

              <div className="mt-5 border-t divider pt-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  <MetadataOnlyBadge mode="readonly" />
                  <span className="badge badge-warning"><AlertTriangle size={12} />דורש אישור Admin</span>
                  {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
                </div>
                <label className="block">
                  <span className="field-label">סיבת Rollback</span>
                  <textarea
                    className="control min-h-20"
                    maxLength={4000}
                    placeholder="לדוגמה: תקלה בגרסה האחרונה, חזרה לגרסה יציבה לאחר אישור גיבוי"
                    value={rollbackReason}
                    onChange={(e) => { setRollbackReason(e.target.value); setRollbackPlan(null); }}
                  />
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn btn-secondary" disabled={!selectedReleaseId || !selectedSiteId || busyAction === "rollback-plan"} onClick={() => runAction("rollback-plan", async () => {
                    const result = await sitesApi.rollbackSiteVersionPlan(selectedSiteId, selectedReleaseId, rollbackReason);
                    setRollbackPlan(result.data);
                    setDeployPlan(null);
                    setMessage("תוכנית Rollback נוצרה לקריאה בלבד");
                  })} type="button"><RotateCcw size={15} />Plan Rollback</button>
                  <button className="btn btn-danger" disabled={!writeAvailable || !selectedReleaseId || !selectedSiteId || busyAction === "rollback-one"} onClick={() => runAction("rollback-one", async () => {
                    const result = await sitesApi.rollbackSiteVersion(selectedSiteId, selectedReleaseId, rollbackReason);
                    const approvalText = result.data.requiresApproval ? "ממתין לאישור Admin" : "נשלח לתור";
                    setMessage(`נוצר Job Rollback: ${result.data.job._id} · ${approvalText}`);
                    await load();
                  })} type="button"><RotateCcw size={15} />בקש Rollback לאישור</button>
                </div>
              </div>

              {deployPlan ? (
                <div className="mt-5 space-y-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <KpiCard title="קבצים" value={formatNumber(deployPlan.summary.filesCount)} icon={<PackageCheck size={18} />} tone={deployPlan.summary.readyForDeploy ? "success" : "warning"} />
                    <KpiCard title="גודל" value={formatBytes(deployPlan.summary.totalSizeBytes)} icon={<PackageCheck size={18} />} tone="neutral" />
                    <KpiCard title="index.html" value={deployPlan.summary.hasIndexHtml ? "קיים" : "חסר"} icon={<PackageCheck size={18} />} tone={deployPlan.summary.hasIndexHtml ? "success" : "danger"} />
                    <KpiCard title="Manifest" value={deployPlan.summary.hasManifest ? "קיים" : "נוצר"} icon={<PackageCheck size={18} />} tone="info" />
                  </div>
                  <LinkRow label="Artifact root" value={deployPlan.artifactRoot} />
                  <LinkRow label="Target dist" value={deployPlan.files[0]?.targetPath?.split("/").slice(0, -1).join("/")} />
                  <DeployTargetInventoryPanel plan={deployPlan} />
                </div>
              ) : null}
              {rollbackPlan ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <KpiCard title="מגרסה" value={rollbackPlan.rollback.fromVersion || "-"} icon={<RotateCcw size={18} />} tone="warning" />
                    <KpiCard title="לגרסה" value={rollbackPlan.rollback.toVersion || "-"} icon={<GitBranch size={18} />} tone="info" />
                    <KpiCard title="קבצים" value={formatNumber(rollbackPlan.summary.filesCount)} icon={<PackageCheck size={18} />} tone={rollbackPlan.summary.readyForDeploy ? "success" : "warning"} />
                    <KpiCard title="ביצוע" value={rollbackPlan.summary.readyForDeployExecution === false ? "חסום" : rollbackPlan.summary.readyForDeploy ? "מוכן" : "לא מוכן"} icon={<PackageCheck size={18} />} tone={rollbackPlan.summary.readyForDeployExecution === false ? "danger" : rollbackPlan.summary.readyForDeploy ? "success" : "warning"} />
                  </div>
                  <div>
                    <LinkRow label="Artifact root" value={rollbackPlan.artifactRoot} />
                    <LinkRow label="Target dist" value={rollbackPlan.files[0]?.targetPath?.split("/").slice(0, -1).join("/")} />
                  </div>
                  <DeployTargetInventoryPanel plan={rollbackPlan} />
                  {rollbackPlan.rollback.reason ? (
                    <div className="soft-panel p-3">
                      <p className="field-label">סיבה</p>
                      <p className="text-sm">{rollbackPlan.rollback.reason}</p>
                    </div>
                  ) : null}
                  {rollbackPlan.rollback.risks?.length ? (
                    <div className="rounded-lg border p-3" style={{ borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", background: "var(--warning-soft)" }}>
                      <div className="mb-2 flex items-center gap-2 font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={16} />סיכוני Rollback</div>
                      <ul className="list-inside list-disc space-y-1 text-sm" style={{ color: "var(--text-strong)" }}>
                        {rollbackPlan.rollback.risks.map((risk) => <li key={risk}>{rollbackRiskLabel(risk)}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {artifactValidation ? (
                <div className="mt-5 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>תוצאת Artifact</p>
                  <p className="num mt-1 text-sm muted">{artifactValidation.summary.filesCount} קבצים · {formatBytes(artifactValidation.summary.totalSizeBytes)}</p>
                  <p className="mt-1 text-sm">{artifactValidation.summary.readyForDeploy ? "מוכן לתכנון פריסה." : "חסר מידע לפריסה מלאה."}</p>
                </div>
              ) : null}
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="אתרים לפי גרסה" subtitle="התפלגות currentVersion">
              {versionGroups.length === 0 ? <EmptyState title="אין מידע גרסאות" description="גרסאות יופיעו לאחר רישום אתרים או release." /> : (
                <div className="space-y-3">
                  {versionGroups.map(([version, count]) => {
                    const pct = sites.length ? Math.round((count / sites.length) * 100) : 0;
                    return (
                      <div key={version}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="num">{version}</span>
                          <span className="num muted">{count} ({pct}%)</span>
                        </div>
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard title="אתרים מיושנים" subtitle="פער מול latest release">
              {outdatedSites.length === 0 ? <EmptyState title="אין אתרים מיושנים" description="כל האתרים הרשומים עדכניים או שלא קיימת גרסה אחרונה." /> : (
                <div className="space-y-2">
                  {outdatedSites.slice(0, 10).map((row: any) => (
                    <div key={row.siteId} className="soft-panel flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.displayName}</p>
                        <p className="num text-xs muted">{row.siteCode}</p>
                      </div>
                      <p className="num text-sm">{row.currentVersion} ← {row.latestVersion}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="היסטוריית Releases" subtitle="רשימת releases קיימת ב־Hub">
            <DataTable columns={["גרסה", "סוג", "נוצר", "Artifact", "הערות", "סטטוס"]} minWidth={980}>
              {releases.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="אין Releases" description="צור release ראשון כדי לנהל גרסאות." /></td></tr>
              ) : releases.map((release) => (
                <tr key={release._id}>
                  <td className="num font-bold">{release.version}</td>
                  <td>{releaseTypeLabel(release.releaseType)}</td>
                  <td className="num text-xs">{formatDateTime(release.createdAt)}</td>
                  <td><code className="num block max-w-[320px] truncate text-xs muted" title={release.artifactRef || ""}>{release.artifactRef || "-"}</code></td>
                  <td>{release.notes || "-"}</td>
                  <td><span className="badge badge-neutral">{release.status}</span></td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
