import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, FileText, RefreshCcw, Search, UserPlus, Users, Workflow } from "lucide-react";
import { Job, LiveAdminSourcesResult, sitesApi } from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { formatDateTime, formatNumber } from "../utils/format";

type AdminSource = "txt" | "siteCollection" | "ownersGroup";

const emptyAdmin = { displayName: "", personalNumber: "", email: "", loginName: "", source: "txt" as AdminSource };

type AdminTxtRepairValue = string | Record<string, unknown>;

type AdminTxtRepairPlan = {
  generatedAt?: string;
  siteId?: string;
  siteCode?: string;
  operation?: string;
  targetPath?: string;
  txtPath?: string;
  usersTxtPath?: string;
  summary?: Record<string, unknown>;
  target?: { path?: string; serverRelativePath?: string };
  additions?: AdminTxtRepairValue[];
  toAdd?: AdminTxtRepairValue[];
  missingInTxt?: AdminTxtRepairValue[];
  removals?: AdminTxtRepairValue[];
  toRemove?: AdminTxtRepairValue[];
  unchanged?: AdminTxtRepairValue[];
  diff?: {
    additions?: AdminTxtRepairValue[];
    toAdd?: AdminTxtRepairValue[];
    missingInTxt?: AdminTxtRepairValue[];
    removals?: AdminTxtRepairValue[];
    toRemove?: AdminTxtRepairValue[];
    unchanged?: AdminTxtRepairValue[];
  };
  preview?: string[];
  proposedTxtLines?: string[];
  targetTxtLines?: string[];
  notes?: string[];
};

type AdminTxtRepairQueueResult = {
  job: Job;
  requiresApproval?: boolean;
  approvalStatus?: string;
  message?: string;
};

type AdminTxtRepairApi = {
  queueAdminTxtRepairPlan?: (siteId: string, notes?: string) => Promise<{ data: AdminTxtRepairPlan }>;
  queueAdminTxtRepair?: (siteId: string, notes?: string) => Promise<{ data: AdminTxtRepairQueueResult }>;
};

const adminTxtRepairApi = sitesApi as typeof sitesApi & AdminTxtRepairApi;

const firstArray = <T,>(...values: unknown[]) => values.find(Array.isArray) as T[] | undefined;

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const adminValueLabel = (value: AdminTxtRepairValue) => {
  if (typeof value === "string") return value;
  const displayName = typeof value.displayName === "string" ? value.displayName : "";
  const personalNumber = typeof value.personalNumber === "string" ? value.personalNumber : "";
  const email = typeof value.email === "string" ? value.email : "";
  const loginName = typeof value.loginName === "string" ? value.loginName : "";
  return [displayName, personalNumber || email || loginName].filter(Boolean).join(" · ") || JSON.stringify(value);
};

const sourceActionLabel = (source: AdminSource) => source === "txt" ? "Mongo" : "SharePoint";

function SourcePanel({ title, source, rows, onRemove }: { title: string; source: AdminSource; rows: any[]; onRemove: (row: any, source: AdminSource) => void }) {
  return (
    <div className="soft-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-bold" style={{ color: "var(--text-strong)" }}>{title}</h3>
        <span className="num badge badge-neutral">{rows.length}</span>
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? <p className="text-sm muted">אין רשומות</p> : rows.map((row, index) => (
          <div key={`${title}-${index}-${row.loginName || row.email || row.personalNumber}`} className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.displayName || "-"}</p>
            <p className="num mt-1 text-xs muted">{row.personalNumber || row.email || row.loginName || "-"}</p>
            <button className="btn btn-danger mt-2 min-h-0 px-2 py-1 text-xs" onClick={() => onRemove(row, source)} type="button">הסר מ־{sourceActionLabel(source)}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [adminData, setAdminData] = useState<any>(null);
  const [liveData, setLiveData] = useState<LiveAdminSourcesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [newAdmin, setNewAdmin] = useState(emptyAdmin);
  const [txtRepairPlan, setTxtRepairPlan] = useState<AdminTxtRepairPlan | null>(null);
  const [txtRepairNotes, setTxtRepairNotes] = useState("");

  const selectedSite = useMemo(() => sites.find((site) => site._id === selectedSiteId), [sites, selectedSiteId]);

  const load = async (siteId?: string) => {
    setLoading(true);
    setError("");
    try {
      const sitesRes = await sitesApi.list();
      setSites(sitesRes.data);
      const targetSiteId = siteId || selectedSiteId || sitesRes.data[0]?._id || "";
      setSelectedSiteId(targetSiteId);
      if (!targetSiteId) {
        setAdminData(null);
        setTxtRepairPlan(null);
        return;
      }
      const adminRes = await sitesApi.siteAdmins(targetSiteId);
      setAdminData(adminRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת מנהלים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const sourceStatus = liveData?.sourceStatus || [];
  const diff = adminData?.adminDifferences || { missingInTxt: [], missingInSiteCollection: [], missingInOwnersGroup: [] };
  const adminsCount = adminData?.adminsCount || 0;
  const txtRepairDiff = useMemo(() => {
    const additions = firstArray<AdminTxtRepairValue>(
      txtRepairPlan?.additions,
      txtRepairPlan?.toAdd,
      txtRepairPlan?.missingInTxt,
      txtRepairPlan?.diff?.additions,
      txtRepairPlan?.diff?.toAdd,
      txtRepairPlan?.diff?.missingInTxt
    ) || [];
    const removals = firstArray<AdminTxtRepairValue>(
      txtRepairPlan?.removals,
      txtRepairPlan?.toRemove,
      txtRepairPlan?.diff?.removals,
      txtRepairPlan?.diff?.toRemove
    ) || [];
    const unchanged = firstArray<AdminTxtRepairValue>(txtRepairPlan?.unchanged, txtRepairPlan?.diff?.unchanged) || [];
    const previewLines = firstArray<string>(txtRepairPlan?.preview, txtRepairPlan?.proposedTxtLines, txtRepairPlan?.targetTxtLines) || [];
    return { additions, removals, unchanged, previewLines };
  }, [txtRepairPlan]);
  const txtRepairSummary = useMemo(() => {
    const summary = txtRepairPlan?.summary || {};
    const additionsCount = firstNumber(
      summary.additionsCount,
      summary.addCount,
      summary.missingInTxtCount,
      summary.changesCount,
      txtRepairDiff.additions.length
    ) || 0;
    const removalsCount = firstNumber(summary.removalsCount, summary.removeCount, txtRepairDiff.removals.length) || 0;
    const unchangedCount = firstNumber(summary.unchangedCount, txtRepairDiff.unchanged.length) || 0;
    const currentCount = firstNumber(summary.currentTxtAdminsCount, summary.currentCount, (adminData?.txtAdmins || []).length) || 0;
    const targetCount = firstNumber(summary.targetTxtAdminsCount, summary.targetCount, summary.targetLineCount, currentCount + additionsCount - removalsCount) || 0;
    const changesCount = additionsCount + removalsCount;
    const targetPath = txtRepairPlan?.targetPath || txtRepairPlan?.txtPath || txtRepairPlan?.usersTxtPath || txtRepairPlan?.target?.serverRelativePath || txtRepairPlan?.target?.path || "";
    return { additionsCount, removalsCount, unchangedCount, currentCount, targetCount, changesCount, targetPath };
  }, [adminData?.txtAdmins, txtRepairDiff, txtRepairPlan]);

  const removeAdmin = async (row: any, source: AdminSource) => {
    const token = row.personalNumber || row.email || row.loginName;
    if (!token) return;
    await runAction(`remove-${token}`, async () => {
      await sitesApi.removeSiteAdmin(selectedSiteId, token, source);
      setMessage(source === "txt" ? `Admin הוסר מרשומת Mongo (${token})` : `Admin הוסר מ־${sourceActionLabel(source)} (${token})`);
      setTxtRepairPlan(null);
      await load(selectedSiteId);
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="מנהלים"
        subtitle="ניהול מקורות הרשאה לאתר: TXT admins נשמרים במטא־דאטה, ו־Site Collection Admins / Owners Group נכתבים ל־SharePoint ומרעננים snapshot."
        actions={<div className="flex flex-wrap gap-2"><MetadataOnlyBadge mode="metadata" /><span className="badge badge-warning">SharePoint write</span></div>}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => load(selectedSiteId)} /> : null}

      {!loading && !error ? (
        <>
          <SectionCard title="בחירת אתר וקריאת מקורות" subtitle="Live read קורא מ־SharePoint ללא שינוי; Sync שומר snapshot/read results ב־Mongo.">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <MetadataOnlyBadge mode="metadata" />
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">אתר</span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setLiveData(null); setTxtRepairPlan(null); setTxtRepairNotes(""); load(e.target.value); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <button className="btn btn-secondary" onClick={() => load(selectedSiteId)} type="button"><RefreshCcw size={15} />רענן</button>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === "live-read"} onClick={() => runAction("live-read", async () => {
                const result = await sitesApi.readLiveSiteAdmins(selectedSiteId);
                setLiveData(result.data);
                setMessage("מקורות מנהלים נקראו מ־SharePoint בקריאה בלבד");
              })} type="button"><Search size={15} />Read live sources</button>
              <button className="btn btn-secondary" disabled={!selectedSiteId || busyAction === "sync"} onClick={() => runAction("sync", async () => {
                const result = await sitesApi.syncSiteAdmins(selectedSiteId, "sync");
                setMessage(`נוצר Job לקריאת מקורות ושמירה ב־Mongo: ${result.data.job._id}`);
                setTxtRepairPlan(null);
                await load(selectedSiteId);
              })} type="button">Sync ל־Mongo</button>
            </div>
          </SectionCard>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="מנהלים ייחודיים" value={formatNumber(adminsCount)} icon={<Users size={18} />} description={selectedSite?.displayName || "אתר נבחר"} tone="info" />
            <KpiCard title="TXT admins" value={formatNumber((adminData?.txtAdmins || []).length)} icon={<Users size={18} />} description="מקור users_data.txt או Mongo snapshot" tone="neutral" />
            <KpiCard title="Site Collection" value={formatNumber((adminData?.siteCollectionAdmins || []).length)} icon={<Users size={18} />} description="מקור SharePoint siteusers" tone="neutral" />
            <KpiCard title="Owners Group" value={formatNumber((adminData?.ownersGroupAdmins || []).length)} icon={<Users size={18} />} description="Associated owners group" tone="neutral" />
          </div>

          {liveData ? (
            <SectionCard title="תוצאות Live read" subtitle="קריאה ישירה מ־SharePoint, ללא פעולת כתיבה">
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div className="soft-panel p-3"><p className="text-xs font-bold muted">נלכד</p><p className="num text-sm">{formatDateTime(liveData.capturedAt)}</p></div>
                <div className="soft-panel p-3"><p className="text-xs font-bold muted">Unique admins</p><p className="num text-sm">{liveData.adminsCount}</p></div>
                {sourceStatus.map((source) => (
                  <div key={source.source} className="soft-panel p-3">
                    <p className="text-xs font-bold muted">{source.source}</p>
                    <p className={`badge ${source.ok ? "badge-success" : "badge-danger"}`}>{source.ok ? `OK (${source.count})` : "Failed"}</p>
                    {source.error ? <p className="mt-2 break-all text-xs muted">{source.error}</p> : null}
                  </div>
                ))}
              </div>
              <DataTable columns={["מקור", "תקין", "כמות", "שגיאה"]} minWidth={720}>
                {sourceStatus.map((source) => (
                  <tr key={source.source}>
                    <td>{source.source}</td>
                    <td><span className={`badge ${source.ok ? "badge-success" : "badge-danger"}`}>{source.ok ? "כן" : "לא"}</span></td>
                    <td className="num">{source.count}</td>
                    <td className="text-xs muted">{source.error || "-"}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          ) : null}

          <SectionCard title="תיקון TXT admins" subtitle="Plan הוא read-only ומציג את הדלתא הצפויה ב־users_data.txt. Queue יוצר Job תיקון TXT בלבד וממתין לאישור Admin במסך Jobs.">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <span className="badge badge-warning"><AlertTriangle size={12} />דורש אישור Admin</span>
              <span className="badge badge-neutral">TXT only</span>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">הערת Queue</span>
                <input
                  className="control"
                  placeholder="לדוגמה: תיקון TXT לפי פערים בין מקורות הרשאה"
                  value={txtRepairNotes}
                  onChange={(e) => setTxtRepairNotes(e.target.value)}
                />
              </label>
              <button className="btn btn-secondary" disabled={!selectedSiteId || busyAction === "txt-repair-plan"} onClick={() => runAction("txt-repair-plan", async () => {
                if (!adminTxtRepairApi.queueAdminTxtRepairPlan) {
                  throw new Error("API client method queueAdminTxtRepairPlan עדיין לא זמין");
                }
                const result = await adminTxtRepairApi.queueAdminTxtRepairPlan(selectedSiteId, txtRepairNotes);
                setTxtRepairPlan(result.data);
                setMessage("תוכנית תיקון TXT נוצרה לקריאה בלבד");
              })} type="button"><ClipboardCheck size={15} />Plan TXT repair</button>
              <button className="btn btn-danger" disabled={!selectedSiteId || !txtRepairPlan || txtRepairSummary.changesCount === 0 || busyAction === "txt-repair-queue"} onClick={() => runAction("txt-repair-queue", async () => {
                if (!adminTxtRepairApi.queueAdminTxtRepair) {
                  throw new Error("API client method queueAdminTxtRepair עדיין לא זמין");
                }
                const result = await adminTxtRepairApi.queueAdminTxtRepair(selectedSiteId, txtRepairNotes);
                const approvalText = result.data.requiresApproval || result.data.job.requiresApproval || result.data.approvalStatus === "awaiting-approval"
                  ? "ממתין לאישור Admin במסך Jobs"
                  : "נשלח לתור";
                setMessage(result.data.message || `נוצר Job תיקון TXT: ${result.data.job._id} · ${approvalText}`);
                await load(selectedSiteId);
              })} type="button"><Workflow size={15} />Queue לאישור</button>
            </div>

            {txtRepairPlan ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="להוספה ל־TXT" value={formatNumber(txtRepairSummary.additionsCount)} icon={<FileText size={18} />} tone={txtRepairSummary.additionsCount ? "warning" : "success"} />
                  <KpiCard title="להסרה מ־TXT" value={formatNumber(txtRepairSummary.removalsCount)} icon={<FileText size={18} />} tone={txtRepairSummary.removalsCount ? "warning" : "success"} />
                  <KpiCard title="TXT נוכחי" value={formatNumber(txtRepairSummary.currentCount)} icon={<Users size={18} />} tone="neutral" />
                  <KpiCard title="TXT אחרי תיקון" value={formatNumber(txtRepairSummary.targetCount)} icon={<Users size={18} />} tone={txtRepairSummary.changesCount ? "info" : "success"} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="soft-panel p-3">
                    <p className="field-label">נוצר</p>
                    <p className="num text-sm">{formatDateTime(txtRepairPlan.generatedAt)}</p>
                  </div>
                  <div className="soft-panel p-3">
                    <p className="field-label">קובץ יעד</p>
                    <code className="num block truncate text-xs muted" title={txtRepairSummary.targetPath}>{txtRepairSummary.targetPath || "users_data.txt"}</code>
                  </div>
                </div>

                {txtRepairPlan.notes?.length ? (
                  <div className="rounded-lg border p-3 text-sm muted" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                    {txtRepairPlan.notes.join(" ")}
                  </div>
                ) : null}

                <DataTable columns={["דלתא", "כמות", "דוגמאות"]} minWidth={840}>
                  {[
                    ["יתווספו ל־TXT", txtRepairDiff.additions],
                    ["יוסרו מ־TXT", txtRepairDiff.removals],
                    ["ללא שינוי", txtRepairDiff.unchanged]
                  ].map(([label, rows]) => {
                    const values = rows as AdminTxtRepairValue[];
                    const sample = values.slice(0, 12).map(adminValueLabel);
                    return (
                      <tr key={label as string}>
                        <td>{label as string}</td>
                        <td className="num">{formatNumber(values.length)}</td>
                        <td><code className="num block max-w-[560px] truncate text-xs muted" title={sample.join(", ")}>{sample.length ? sample.join(", ") : "-"}</code></td>
                      </tr>
                    );
                  })}
                </DataTable>

                {txtRepairDiff.previewLines.length ? (
                  <div className="rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                    <p className="field-label">TXT preview</p>
                    <pre className="num mt-2 max-h-72 overflow-auto text-xs">{txtRepairDiff.previewLines.slice(0, 80).join("\n")}</pre>
                  </div>
                ) : null}

                <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", color: "var(--text-strong)" }}>
                  <div className="mb-1 flex items-center gap-2 font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={15} />Approval gate</div>
                  Queue ייצור Job עם operation=admin-txt-repair. הביצוע לא ירוץ עד אישור Admin במסך Jobs.
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="הוספת Admin" subtitle="TXT מעדכן מטא־דאטה ב־Hub. Site Collection ו־Owners Group מבצעים כתיבה אמיתית ל־SharePoint ואז קריאת אימות.">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="metadata" />
              <span className="badge badge-warning">SharePoint write</span>
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <label className="block">
                <span className="field-label">שם</span>
                <input className="control" value={newAdmin.displayName} onChange={(e) => setNewAdmin((p) => ({ ...p, displayName: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">מספר אישי</span>
                <input className="control" placeholder="s1234567" value={newAdmin.personalNumber} onChange={(e) => setNewAdmin((p) => ({ ...p, personalNumber: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">מייל</span>
                <input className="control" value={newAdmin.email} onChange={(e) => setNewAdmin((p) => ({ ...p, email: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">Login</span>
                <input className="control" value={newAdmin.loginName} onChange={(e) => setNewAdmin((p) => ({ ...p, loginName: e.target.value }))} />
              </label>
              <label className="block">
                <span className="field-label">מקור</span>
                <select className="control" value={newAdmin.source} onChange={(e) => setNewAdmin((p) => ({ ...p, source: e.target.value as AdminSource }))}>
                  <option value="txt">TXT</option>
                  <option value="siteCollection">Site Collection</option>
                  <option value="ownersGroup">Owners Group</option>
                </select>
              </label>
            </div>
            <button className="btn btn-primary mt-4" disabled={!selectedSiteId || busyAction === "add"} onClick={() => runAction("add", async () => {
              await sitesApi.addSiteAdmin(selectedSiteId, newAdmin);
              setMessage(newAdmin.source === "txt" ? "Admin נוסף לרשומת Mongo" : `Admin נוסף ל־${sourceActionLabel(newAdmin.source)} ואומת מול SharePoint`);
              setNewAdmin(emptyAdmin);
              setTxtRepairPlan(null);
              await load(selectedSiteId);
            })} type="button"><UserPlus size={15} />הוסף</button>
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-3">
            <SourcePanel title="TXT admins" source="txt" rows={adminData?.txtAdmins || []} onRemove={removeAdmin} />
            <SourcePanel title="Site Collection Admins" source="siteCollection" rows={adminData?.siteCollectionAdmins || []} onRemove={removeAdmin} />
            <SourcePanel title="Owners Group" source="ownersGroup" rows={adminData?.ownersGroupAdmins || []} onRemove={removeAdmin} />
          </div>

          <SectionCard title="פערים בין מקורות" subtitle="הפערים נגזרים מהמפתחות המנורמלים של הרשומות">
            <DataTable columns={["פער", "כמות", "ערכים"]} minWidth={760}>
              {[
                ["חסרים ב־TXT", diff.missingInTxt || []],
                ["חסרים ב־Site Collection", diff.missingInSiteCollection || []],
                ["חסרים ב־Owners Group", diff.missingInOwnersGroup || []]
              ].map(([label, rows]: any) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{rows.length}</td>
                  <td><code className="num block max-w-[620px] truncate text-xs muted" title={rows.join(", ")}>{rows.length ? rows.join(", ") : "-"}</code></td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
