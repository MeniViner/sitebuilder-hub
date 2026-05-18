import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Site, SiteStatus } from "../types/site";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { LinkRow } from "./LinkRow";
import { MetadataOnlyBadge } from "./MetadataOnlyBadge";

type Errors = Partial<Record<keyof Site, string>>;
type StepKey = "identity" | "paths" | "lifecycle";
export type SiteFormSaveOptions = { bootstrapSharePoint: boolean };

const initialForm: Partial<Site> = {
  displayName: "",
  siteCode: "",
  description: "",
  unitName: "",
  sharePointSiteUrl: "",
  finalAppUrl: "",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  ownerName: "",
  ownerPersonalNumber: "",
  ownerEmail: "",
  ownerPhone: "",
  version: "1.0.0",
  status: "draft",
  notes: ""
};

const steps: { key: StepKey; label: string; hint: string }[] = [
  { key: "identity", label: "זהות ובעלות", hint: "שם אתר, יחידה ובעלים" },
  { key: "paths", label: "נתיבי SharePoint", hint: "siteDB, siteUsersDb ו-bootstrap" },
  { key: "lifecycle", label: "מחזור חיים", hint: "סטטוס, גרסה והערות" }
];

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
  helper
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
  helper?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="field-label">{label}</span>
      <input className="control" type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      {helper ? <span className="mt-1 block text-xs muted">{helper}</span> : null}
      {error ? <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>{error}</span> : null}
    </label>
  );
}

export function SiteFormModal({
  open,
  site,
  onClose,
  onSave
}: {
  open: boolean;
  site?: Site | null;
  onClose: () => void;
  onSave: (payload: Partial<Site>, options: SiteFormSaveOptions) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Site>>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [activeStep, setActiveStep] = useState<StepKey>("identity");
  const [saving, setSaving] = useState(false);
  const [bootstrapSharePoint, setBootstrapSharePoint] = useState(false);

  useEffect(() => {
    setForm(site ? { ...initialForm, ...site } : initialForm);
    setErrors({});
    setActiveStep("identity");
    setSaving(false);
    setBootstrapSharePoint(false);
  }, [site, open]);

  const resolvedPreview = useMemo(() => resolveSiteBuilderPaths(form), [form]);

  const applySiteCodeDefaults = (codeRaw: string) => {
    const code = codeRaw.trim();
    setForm((prev) => {
      const next = { ...prev, siteCode: codeRaw };
      const paths = resolveSiteBuilderPaths(next);
      return {
        ...next,
        sharePointSiteUrl: !site ? `https://portal.army.idf/sites/${code}` : prev.sharePointSiteUrl,
        finalAppUrl: !site ? paths?.finalAppUrl || "" : prev.finalAppUrl
      };
    });
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!form.displayName?.trim()) next.displayName = "שם אתר הוא שדה חובה";
    if (!form.siteCode?.trim()) next.siteCode = "קוד אתר הוא שדה חובה";
    if (!form.sharePointSiteUrl?.trim()) next.sharePointSiteUrl = "כתובת SharePoint היא שדה חובה";

    if (form.sharePointSiteUrl?.trim()) {
      try { new URL(form.sharePointSiteUrl); } catch { next.sharePointSiteUrl = "כתובת SharePoint אינה תקינה"; }
    }
    if (form.finalAppUrl?.trim()) {
      try { new URL(form.finalAppUrl); } catch { next.finalAppUrl = "קישור סופי אינו תקין"; }
    }
    if (form.ownerEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) {
      next.ownerEmail = "כתובת מייל אינה תקינה";
    }
    return next;
  };

  const save = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      await onSave(form, { bootstrapSharePoint: !site && bootstrapSharePoint });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="surface-card flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b divider px-5 py-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{site ? "עריכת אתר" : "יצירת אתר חדש"}</h2>
              <MetadataOnlyBadge mode="metadata" />
            </div>
            <p className="text-sm muted">{site ? "הרשומה נשמרת ב־Mongo. יצירה או שינוי ב־SharePoint אינם מתבצעים מכאן." : "אפשר לשמור רשומה בלבד, או לשמור ולפתוח Bootstrap ל־SharePoint."}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור"><X size={17} /></button>
        </header>

        <div className="grid gap-2 border-b divider p-4 md:grid-cols-3">
          {steps.map((step) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              className={`rounded-md border px-3 py-2 text-right transition ${activeStep === step.key ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-muted)]"}`}
            >
              <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>{step.label}</p>
              <p className="mt-0.5 text-xs muted">{step.hint}</p>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {activeStep === "identity" ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="soft-panel p-4">
                <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>פרטי אתר</h3>
                <div className="grid gap-3">
                  <Field label="שם אתר" placeholder="לדוגמה: פורטל משאבי אנוש" value={form.displayName} error={errors.displayName} onChange={(value) => setForm((p) => ({ ...p, displayName: value }))} />
                  <Field label="קוד אתר" placeholder="לדוגמה: hr-portal" value={form.siteCode} error={errors.siteCode} onChange={applySiteCodeDefaults} helper="משמש לגזירת /sites/<siteCode> ונתיבי Site Builder." />
                  <Field label="תיאור" value={form.description} onChange={(value) => setForm((p) => ({ ...p, description: value }))} />
                  <Field label="יחידה" value={form.unitName} onChange={(value) => setForm((p) => ({ ...p, unitName: value }))} />
                </div>
              </section>

              <section className="soft-panel p-4">
                <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>בעלות</h3>
                <div className="grid gap-3">
                  <Field label="שם בעל האתר" value={form.ownerName} onChange={(value) => setForm((p) => ({ ...p, ownerName: value }))} />
                  <Field label="מספר אישי" value={form.ownerPersonalNumber} onChange={(value) => setForm((p) => ({ ...p, ownerPersonalNumber: value }))} />
                  <Field label="מייל" value={form.ownerEmail} error={errors.ownerEmail} onChange={(value) => setForm((p) => ({ ...p, ownerEmail: value }))} />
                  <Field label="טלפון" value={form.ownerPhone} onChange={(value) => setForm((p) => ({ ...p, ownerPhone: value }))} />
                </div>
              </section>
            </div>
          ) : null}

          {activeStep === "paths" ? (
            <div className="space-y-5">
              <section className="soft-panel p-4">
                <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>קלט נתיבים</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="כתובת אתר SharePoint" value={form.sharePointSiteUrl} error={errors.sharePointSiteUrl} onChange={(value) => setForm((p) => ({ ...p, sharePointSiteUrl: value }))} />
                  <Field label="קישור סופי לאתר" value={form.finalAppUrl || resolvedPreview?.finalAppUrl || ""} error={errors.finalAppUrl} onChange={(value) => setForm((p) => ({ ...p, finalAppUrl: value }))} />
                  <Field label="siteDB" value={form.siteDbLibrary} onChange={(value) => setForm((p) => ({ ...p, siteDbLibrary: value }))} />
                  <Field label="siteUsersDb" value={form.usersDbLibrary} onChange={(value) => setForm((p) => ({ ...p, usersDbLibrary: value }))} />
                  <Field label="Bootstrap library" value={form.bootstrapLibrary} onChange={(value) => setForm((p) => ({ ...p, bootstrapLibrary: value }))} />
                  <Field label="Bootstrap folder" value={form.bootstrapFolder} onChange={(value) => setForm((p) => ({ ...p, bootstrapFolder: value }))} />
                  <label className="block text-sm">
                    <span className="field-label">מיקום widgets_data.txt</span>
                    <select className="control" value={form.widgetsDbTarget || "users"} onChange={(e) => setForm((p) => ({ ...p, widgetsDbTarget: e.target.value as "users" | "site" }))}>
                      <option value="users">siteUsersDb</option>
                      <option value="site">siteDB/siteAssets</option>
                    </select>
                  </label>
                </div>
              </section>

              {resolvedPreview ? (
                <section className="soft-panel p-4">
                  <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--text-strong)" }}>תצוגה מקדימה של נתיבי Site Builder</h3>
                  <LinkRow label="Final app URL" value={resolvedPreview.finalAppUrl} isUrl />
                  <LinkRow label="siteDB root" value={resolvedPreview.siteDbRoot} />
                  <LinkRow label="siteUsersDb root" value={resolvedPreview.usersDbRoot} />
                  <LinkRow label="master config" value={resolvedPreview.txtFiles.masterConfig} />
                  <LinkRow label="widgets_data.txt" value={resolvedPreview.txtFiles.widgets} />
                  <LinkRow label="Bootstrap setup URL" value={resolvedPreview.bootstrapUrl} isUrl />
                </section>
              ) : null}
            </div>
          ) : null}

          {activeStep === "lifecycle" ? (
            <div className="space-y-5">
              {!site ? (
                <section className="soft-panel p-4">
                  <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>פעולת יצירה</h3>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={bootstrapSharePoint}
                      onChange={(e) => setBootstrapSharePoint(e.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-bold" style={{ color: "var(--text-strong)" }}>
                        שמור והפעל Bootstrap ל־SharePoint
                      </span>
                      <span className="mt-1 block text-xs muted">
                        כבוי: שמירת registry בלבד. דלוק: אחרי יצירת הרשומה ייפתח job מסוג site-bootstrap.
                      </span>
                    </span>
                  </label>
                </section>
              ) : null}

              <section className="soft-panel p-4">
                <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>סטטוס וגרסה</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block text-sm">
                    <span className="field-label">סטטוס</span>
                    <select className="control" value={form.status || "draft"} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SiteStatus }))}>
                      <option value="draft">טיוטה</option>
                      <option value="active">פעיל</option>
                      <option value="warning">אזהרה</option>
                      <option value="failed">נכשל</option>
                      <option value="archived">בארכיון</option>
                    </select>
                  </label>
                  <Field label="גרסה נוכחית" value={form.version} onChange={(value) => setForm((p) => ({ ...p, version: value }))} />
                  <label className="block text-sm md:col-span-3">
                    <span className="field-label">הערות</span>
                    <textarea className="control min-h-28" value={form.notes || ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </label>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t divider px-5 py-4" style={{ background: "var(--surface)" }}>
          <div className="text-xs muted">{!site && bootstrapSharePoint ? "לאחר השמירה יישלח Bootstrap לפי חוזה ה־API החדש." : "שדות הנתיבים נגזרים לפי ארכיטקטורת SharePoint האמיתית: `/siteDB/dist/index.html`."}</div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onClose} type="button">ביטול</button>
            <button className="btn btn-primary" onClick={save} type="button" disabled={saving}>{saving ? "שומר..." : !site && bootstrapSharePoint ? "שמור והפעל Bootstrap" : "שמור רשומה"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
