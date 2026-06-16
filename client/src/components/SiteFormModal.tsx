import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderCheck, Plus, Sparkles, X } from "lucide-react";
import { Site, SiteStatus } from "../types/site";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { LinkRow } from "./LinkRow";
import { MetadataOnlyBadge } from "./MetadataOnlyBadge";
import { HelpIcon } from "./help/HelpIcon";
import { HelpLabel } from "./help/HelpLabel";

type FlowKey = "track-existing" | "create-new";
type Errors = Partial<Record<keyof Site | "initialAdmins", string>>;
type TrackStepKey = "basic" | "connection" | "validate" | "save";
type CreateStepKey = "basic" | "owners" | "location" | "plan" | "provision" | "deploy" | "verification";

type BootstrapOptions = {
  owner?: string;
  runProvisioning?: boolean;
  runPermissionsSetup?: boolean;
  reason?: string;
};

export type SiteFormSaveOptions = {
  flow: FlowKey;
  bootstrapSharePoint: boolean;
  runReadOnlyValidation: boolean;
  bootstrapOptions?: BootstrapOptions;
};

type AdminIdentity = {
  displayName?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
};

const initialForm: Partial<Site> = {
  displayName: "",
  siteCode: "",
  description: "",
  environment: "unknown",
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

const trackSteps: { key: TrackStepKey; label: string; hint: string }[] = [
  { key: "basic", label: "פרטים בסיסיים", hint: "שם, קוד וסביבה" },
  { key: "connection", label: "חיבור SharePoint", hint: "כתובות ונתיבי Site Builder" },
  { key: "validate", label: "בדיקה", hint: "קריאה בלבד וללא יצירה" },
  { key: "save", label: "שמירה ומעקב", hint: "שמירה ב־HUB" }
];

const createSteps: { key: CreateStepKey; label: string; hint: string }[] = [
  { key: "basic", label: "פרטים בסיסיים", hint: "שם, קוד וסביבה" },
  { key: "owners", label: "בעלים ומנהלים", hint: "אתחול users_data" },
  { key: "location", label: "יעד SharePoint", hint: "אתר, ספריות ונתיבים" },
  { key: "plan", label: "תוכנית הקמה", hint: "סקירה לפני ביצוע" },
  { key: "provision", label: "יצירה והקמה", hint: "siteDB, קבצים והרשאות" },
  { key: "deploy", label: "פריסה ראשונית", hint: "אופציונלי דרך Releases" },
  { key: "verification", label: "אימות וראיות", hint: "Job, Audit ו־Health" }
];

const txtFileLabels: Array<{ key: keyof NonNullable<NonNullable<ReturnType<typeof resolveSiteBuilderPaths>>["txtFiles"]>; label: string }> = [
  { key: "masterConfig", label: "bihs_master_config_v1.txt" },
  { key: "users", label: "users_data.txt" },
  { key: "events", label: "events_data.txt" },
  { key: "navigation", label: "nav_data.txt" },
  { key: "siteContent", label: "site_content_data.txt" },
  { key: "theme", label: "theme_data.txt" },
  { key: "widgets", label: "widgets_data.txt" },
  { key: "externalLinks", label: "external_links_data.txt" },
  { key: "gantt", label: "gantt_data.txt" }
];

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
  helper,
  helpKey
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
  helper?: string;
  helpKey?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="field-label"><HelpLabel helpKey={helpKey}>{label}</HelpLabel></span>
      <input className="control" type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      {helper ? <span className="mt-1 block text-xs muted">{helper}</span> : null}
      {error ? <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>{error}</span> : null}
    </label>
  );
}

function StepNav<T extends string>({
  steps,
  active,
  onSelect
}: {
  steps: Array<{ key: T; label: string; hint: string }>;
  active: T;
  onSelect: (step: T) => void;
}) {
  return (
    <div className="grid gap-2 border-b divider p-4 md:grid-cols-4 xl:grid-cols-7">
      {steps.map((step) => (
        <button
          key={step.key}
          type="button"
          onClick={() => onSelect(step.key)}
          className={`rounded-md border px-3 py-2 text-right transition ${active === step.key ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-muted)]"}`}
        >
          <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>{step.label}</p>
          <p className="mt-0.5 text-xs muted">{step.hint}</p>
        </button>
      ))}
    </div>
  );
}

const serializeAdmins = (admins?: AdminIdentity[]) =>
  (admins || [])
    .map((admin) => [admin.displayName, admin.personalNumber, admin.email].filter(Boolean).join(" | "))
    .join("\n");

const parseAdmins = (text: string): AdminIdentity[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[|,]/).map((part) => part.trim());
      const [displayName, personalNumber, email] = parts;
      return { displayName, personalNumber, email };
    });

const hasValidEmail = (value?: string) => !value?.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

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
  const [flow, setFlow] = useState<FlowKey | "choice">("choice");
  const [trackStep, setTrackStep] = useState<TrackStepKey>("basic");
  const [createStep, setCreateStep] = useState<CreateStepKey>("basic");
  const [saving, setSaving] = useState(false);
  const [initialAdminsText, setInitialAdminsText] = useState("");

  useEffect(() => {
    setForm(site ? { ...initialForm, ...site } : initialForm);
    setErrors({});
    setFlow(site ? "track-existing" : "choice");
    setTrackStep("basic");
    setCreateStep("basic");
    setSaving(false);
    setInitialAdminsText(serializeAdmins(site?.txtAdmins));
  }, [site, open]);

  const resolvedPreview = useMemo(() => resolveSiteBuilderPaths(form), [form]);
  const parsedInitialAdmins = useMemo(() => parseAdmins(initialAdminsText), [initialAdminsText]);

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

  const selectFlow = (nextFlow: FlowKey) => {
    setFlow(nextFlow);
    setErrors({});
    if (nextFlow === "track-existing") {
      setTrackStep("basic");
      setForm((prev) => ({ ...prev, status: prev.status === "draft" ? "active" : prev.status }));
    } else {
      setCreateStep("basic");
      setForm((prev) => ({ ...prev, status: "draft" }));
    }
  };

  const validate = (targetFlow: FlowKey): Errors => {
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
    if (!hasValidEmail(form.ownerEmail)) next.ownerEmail = "כתובת מייל אינה תקינה";

    if (targetFlow === "create-new") {
      if (!form.ownerPersonalNumber?.trim()) next.ownerPersonalNumber = "מספר אישי של בעל האתר נדרש לאתחול מנהלים";
      if (!form.ownerEmail?.trim()) next.ownerEmail = "מייל בעל האתר נדרש ליצירת אתר SharePoint";
    }

    const invalidAdmin = parsedInitialAdmins.find((admin) => admin.email && !hasValidEmail(admin.email));
    if (invalidAdmin) next.initialAdmins = "אחד ממיילי המנהלים הראשוניים אינו תקין";
    return next;
  };

  const buildPayload = (targetFlow: FlowKey): Partial<Site> => {
    const paths = resolveSiteBuilderPaths(form);
    return {
      ...form,
      status: site ? form.status : targetFlow === "track-existing" ? "active" : "draft",
      sharePointHost: paths?.host || form.sharePointHost,
      sharePointSiteUrl: form.sharePointSiteUrl || paths?.sharePointSiteUrl || "",
      finalAppUrl: form.finalAppUrl || paths?.finalAppUrl || "",
      bootstrapUrl: paths?.bootstrapUrl || form.bootstrapUrl || "",
      txtAdmins: parsedInitialAdmins
    };
  };

  const save = async () => {
    const targetFlow = flow === "choice" ? "track-existing" : flow;
    const nextErrors = validate(targetFlow);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave(buildPayload(targetFlow), {
        flow: targetFlow,
        bootstrapSharePoint: !site && targetFlow === "create-new",
        runReadOnlyValidation: !site && targetFlow === "track-existing",
        bootstrapOptions: targetFlow === "create-new"
          ? {
              owner: form.ownerEmail?.trim(),
              runProvisioning: true,
              runPermissionsSetup: true,
              reason: "Create new Site Builder site from Hub"
            }
          : undefined
      });
    } finally {
      setSaving(false);
    }
  };

  const currentSteps = flow === "create-new" ? createSteps : trackSteps;
  const activeStep = flow === "create-new" ? createStep : trackStep;
  const activeIndex = currentSteps.findIndex((step) => step.key === activeStep);
  const isLastStep = activeIndex === currentSteps.length - 1;

  const goBack = () => {
    if (flow === "choice") return;
    if (activeIndex <= 0) {
      if (!site) setFlow("choice");
      return;
    }
    const previous = currentSteps[activeIndex - 1]?.key;
    if (flow === "create-new") setCreateStep(previous as CreateStepKey);
    else setTrackStep(previous as TrackStepKey);
  };

  const goNext = () => {
    if (flow === "choice") return;
    const targetFlow = flow;
    const nextErrors = validate(targetFlow);
    if (Object.keys(nextErrors).length > 0 && (activeStep === "plan" || activeStep === "validate" || activeStep === "verification")) {
      setErrors(nextErrors);
      return;
    }
    const next = currentSteps[activeIndex + 1]?.key;
    if (!next) return;
    if (flow === "create-new") setCreateStep(next as CreateStepKey);
    else setTrackStep(next as TrackStepKey);
  };

  const creationPlanBlockers = validate("create-new");
  const creationPlanReady = Object.keys(creationPlanBlockers).length === 0;

  if (!open) return null;

  const renderBasicFields = () => (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>פרטי אתר</h3>
        <div className="grid gap-3">
          <Field label="שם אתר" placeholder="לדוגמה: פורטל משאבי אנוש" value={form.displayName} error={errors.displayName} onChange={(value) => setForm((p) => ({ ...p, displayName: value }))} helpKey="sites.registry" />
          <Field label="קוד אתר" placeholder="לדוגמה: hr-portal" value={form.siteCode} error={errors.siteCode} onChange={applySiteCodeDefaults} helper="משמש לגזירת /sites/<siteCode> ונתיבי Site Builder." helpKey="site.code" />
          <Field label="תיאור" value={form.description} onChange={(value) => setForm((p) => ({ ...p, description: value }))} />
          <label className="block text-sm">
            <span className="field-label"><HelpLabel helpKey="site.environment">סביבת יעד</HelpLabel></span>
            <select className="control" value={form.environment || "unknown"} onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value as Site["environment"] }))}>
              <option value="unknown">Unknown</option>
              <option value="local">Local</option>
              <option value="dev">Dev</option>
              <option value="test">Test</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
          <Field label="יחידה" value={form.unitName} onChange={(value) => setForm((p) => ({ ...p, unitName: value }))} />
        </div>
      </section>

      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מחזור חיים</h3>
        <div className="grid gap-3">
          <label className="block text-sm">
            <span className="field-label"><HelpLabel helpKey="job.status">סטטוס</HelpLabel></span>
            <select className="control" value={form.status || "draft"} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SiteStatus }))}>
              <option value="draft">טיוטה</option>
              <option value="active">פעיל</option>
              <option value="warning">אזהרה</option>
              <option value="failed">נכשל</option>
              <option value="archived">בארכיון</option>
            </select>
          </label>
          <Field label="גרסה נוכחית" value={form.version} onChange={(value) => setForm((p) => ({ ...p, version: value }))} helpKey="version.current" />
          <label className="block text-sm">
            <span className="field-label">הערות</span>
            <textarea className="control min-h-28" value={form.notes || ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>
        </div>
      </section>
    </div>
  );

  const renderConnectionFields = (createMode = false) => (
    <div className="space-y-5">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>{createMode ? "יעד הקמה" : "חיבור SharePoint"}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={createMode ? "כתובת אתר SharePoint שיוקם" : "כתובת אתר SharePoint קיים"} value={form.sharePointSiteUrl} error={errors.sharePointSiteUrl} onChange={(value) => setForm((p) => ({ ...p, sharePointSiteUrl: value }))} helpKey="site.sharepointUrl" />
          <Field label="קישור סופי לאתר" value={form.finalAppUrl || resolvedPreview?.finalAppUrl || ""} error={errors.finalAppUrl} onChange={(value) => setForm((p) => ({ ...p, finalAppUrl: value }))} helpKey="site.finalDistPath" />
          <Field label="siteDB" value={form.siteDbLibrary} onChange={(value) => setForm((p) => ({ ...p, siteDbLibrary: value }))} />
          <Field label="siteUsersDb" value={form.usersDbLibrary} onChange={(value) => setForm((p) => ({ ...p, usersDbLibrary: value }))} />
          <Field label="Bootstrap library" value={form.bootstrapLibrary} onChange={(value) => setForm((p) => ({ ...p, bootstrapLibrary: value }))} />
          <Field label="Bootstrap folder" value={form.bootstrapFolder} onChange={(value) => setForm((p) => ({ ...p, bootstrapFolder: value }))} />
          <label className="block text-sm">
            <span className="field-label"><HelpLabel helpKey="site.finalDistPath">מיקום widgets_data.txt</HelpLabel></span>
            <select className="control" value={form.widgetsDbTarget || "users"} onChange={(e) => setForm((p) => ({ ...p, widgetsDbTarget: e.target.value as "users" | "site" }))}>
              <option value="users">siteUsersDb</option>
              <option value="site">siteDB/siteAssets</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="field-label"><HelpLabel helpKey="site.connectorMode">מחבר SharePoint</HelpLabel></span>
            <select className="control" value={createMode ? "backend-sharepoint" : "read-only"} disabled>
              <option value="read-only">קריאה בלבד</option>
              <option value="backend-sharepoint">Backend SharePoint job</option>
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
          <LinkRow label="gantt_data.txt" value={resolvedPreview.txtFiles.gantt} />
          <LinkRow label="Bootstrap setup URL" value={resolvedPreview.bootstrapUrl} isUrl />
        </section>
      ) : null}
    </div>
  );

  const renderOwners = () => (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>בעל האתר</h3>
        <div className="grid gap-3">
          <Field label="שם בעל האתר" value={form.ownerName} onChange={(value) => setForm((p) => ({ ...p, ownerName: value }))} helpKey="site.owner" />
          <Field label="מספר אישי" value={form.ownerPersonalNumber} error={errors.ownerPersonalNumber} onChange={(value) => setForm((p) => ({ ...p, ownerPersonalNumber: value }))} helpKey="site.owner" />
          <Field label="מייל" value={form.ownerEmail} error={errors.ownerEmail} onChange={(value) => setForm((p) => ({ ...p, ownerEmail: value }))} helper="משמש כ־Owner בבקשת יצירת אתר SharePoint." helpKey="site.owner" />
          <Field label="טלפון" value={form.ownerPhone} onChange={(value) => setForm((p) => ({ ...p, ownerPhone: value }))} />
        </div>
      </section>

      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מנהלים ראשוניים</h3>
        <label className="block text-sm">
          <span className="field-label"><HelpLabel helpKey="site.admins">רשימת מנהלים</HelpLabel></span>
          <textarea
            className="control min-h-40"
            value={initialAdminsText}
            onChange={(e) => setInitialAdminsText(e.target.value)}
            placeholder="שם | מספר אישי | מייל"
          />
          <span className="mt-1 block text-xs muted">שורה לכל מנהל. בעל האתר יתווסף גם ל־users_data.txt בזמן ההקמה.</span>
          {errors.initialAdmins ? <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>{errors.initialAdmins}</span> : null}
        </label>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="badge badge-neutral">{parsedInitialAdmins.length} מנהלים מהרשימה</span>
          {form.ownerPersonalNumber ? <span className="badge badge-info">בעל אתר: {form.ownerPersonalNumber}</span> : null}
        </div>
      </section>
    </div>
  );

  const renderTrackValidate = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מה יקרה במסלול אתר קיים</h3>
        <div className="space-y-2 text-sm">
          <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 text-[var(--success)]" size={16} /> הרשומה תישמר ב־HUB ותתחיל להופיע בטבלאות ובדוחות.</p>
          <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 text-[var(--success)]" size={16} /> לאחר השמירה תורץ בדיקת SharePoint קריאה בלבד אם החיבור זמין.</p>
          <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 text-[var(--success)]" size={16} /> לא ייווצרו ספריות, תיקיות, קבצים או הרשאות.</p>
        </div>
      </section>
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>חסמים לפני שמירה</h3>
        {Object.keys(validate("track-existing")).length === 0 ? (
          <p className="text-sm muted">אין חסמים בטופס. בדיקת החיבור בפועל תרוץ אחרי השמירה.</p>
        ) : (
          <div className="space-y-1 text-sm" style={{ color: "var(--danger)" }}>
            {Object.values(validate("track-existing")).map((message) => <p key={message}>{message}</p>)}
          </div>
        )}
      </section>
    </div>
  );

  const renderTrackSave = () => (
    <section className="soft-panel p-4">
      <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>שמירה ומעקב</h3>
      <p className="text-sm muted">הפעולה תשמור את האתר כרשומה פעילה ותנסה לקרוא בריאות וגרסה ללא כתיבה ל־SharePoint.</p>
      {resolvedPreview ? (
        <div className="mt-3">
          <LinkRow label="אתר SharePoint" value={resolvedPreview.sharePointSiteUrl} isUrl />
          <LinkRow label="אפליקציה סופית" value={resolvedPreview.finalAppUrl} isUrl />
        </div>
      ) : null}
    </section>
  );

  const renderCreatePlan = () => (
    <div className="space-y-5">
      <section className="soft-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>תוכנית לפני ביצוע</h3>
          <span className={`badge ${creationPlanReady ? "badge-success" : "badge-danger"}`}>{creationPlanReady ? "מוכן לתכנון" : "יש חסמים"}</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>מה ייווצר</p>
            <ul className="mt-2 space-y-1 text-sm muted">
              <li>אתר SharePoint בכתובת היעד אם אינו קיים.</li>
              <li>ספריות Document Library: siteDB ו־siteUsersDb.</li>
              <li>תיקיות dist, siteAssets, images, Backups ו־Bootstrap.</li>
              <li>קבצי TXT/JSON ראשוניים לפי Site Builder הנוכחי.</li>
              <li>הרשאות siteUsersDb וראיות Job/Audit.</li>
            </ul>
          </div>
          <div className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>מחברים</p>
            <ul className="mt-2 space-y-1 text-sm muted">
              <li>Backend: יצירת אתר, ספריות, תיקיות, TXT, הרשאות ו־Audit כאשר auth מוגדר.</li>
              <li>Browser SharePoint: נדרש כאשר ההקמה חייבת לרוץ עם SSO של הדפדפן.</li>
              <li>HUB: שמירת registry, job, evidence וסטטוס.</li>
            </ul>
          </div>
        </div>
      </section>

      {resolvedPreview ? (
        <section className="soft-panel p-4">
          <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>נתיבים שייגעו בהם</h3>
          <div className="grid gap-x-5 md:grid-cols-2">
            <LinkRow label="SharePoint site" value={resolvedPreview.sharePointSiteUrl} isUrl />
            <LinkRow label="siteDB" value={resolvedPreview.siteDbRoot} />
            <LinkRow label="siteUsersDb" value={resolvedPreview.usersDbRoot} />
            <LinkRow label="siteAssets" value={resolvedPreview.siteAssetsRoot} />
            <LinkRow label="images" value={resolvedPreview.imagesRoot} />
            <LinkRow label="dist" value={resolvedPreview.finalDistRoot} />
            <LinkRow label="bootstrap dist" value={resolvedPreview.bootstrapDistRoot} />
            <LinkRow label="final app" value={resolvedPreview.finalAppUrl} isUrl />
          </div>
        </section>
      ) : null}

      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>קבצים שייווצרו אם חסרים</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {resolvedPreview ? txtFileLabels.map((file) => (
            <LinkRow key={file.key} label={file.label} value={resolvedPreview.txtFiles[file.key]} />
          )) : <p className="text-sm muted">יש להזין קוד אתר כדי לחשב נתיבים.</p>}
        </div>
      </section>

      {!creationPlanReady ? (
        <section className="soft-panel p-4" style={{ borderColor: "var(--danger)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--danger)" }}>חסמים</h3>
          <div className="space-y-1 text-sm" style={{ color: "var(--danger)" }}>
            {Object.values(creationPlanBlockers).map((message) => <p key={message}>{message}</p>)}
          </div>
        </section>
      ) : null}
    </div>
  );

  const renderProvision = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>רצף יצירה</h3>
        <ol className="space-y-2 text-sm muted">
          <li>1. שמירת רשומת טיוטה ב־HUB.</li>
          <li>2. יצירת Job מסוג site-bootstrap.</li>
          <li>3. יצירת/זיהוי אתר SharePoint.</li>
          <li>4. Provision ל־siteDB, siteUsersDb, תיקיות וקבצי TXT.</li>
          <li>5. הגדרת הרשאות siteUsersDb וכתיבת marker.</li>
          <li>6. Health check ורישום evidence.</li>
        </ol>
      </section>
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>בעלים ומנהלים</h3>
        <LinkRow label="Owner email" value={form.ownerEmail || "-"} />
        <LinkRow label="Owner personal number" value={form.ownerPersonalNumber || "-"} />
        <LinkRow label="Initial admins" value={`${parsedInitialAdmins.length} מהרשימה + בעל האתר`} />
      </section>
    </div>
  );

  const renderDeploy = () => (
    <section className="soft-panel p-4">
      <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>פריסה ראשונית</h3>
      <label className="flex cursor-not-allowed items-start gap-3 rounded-md border p-3 opacity-70" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <input className="mt-1" type="checkbox" disabled />
        <span>
          <span className="block text-sm font-bold" style={{ color: "var(--text-strong)" }}>הרץ פריסה ראשונית</span>
          <span className="mt-1 block text-xs muted">פריסה ראשונית נשארת במסך Releases, כי היא דורשת release/artifact ממשי.</span>
        </span>
      </label>
    </section>
  );

  const renderVerification = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>ראיות שיישמרו</h3>
        <ul className="space-y-1 text-sm muted">
          <li>Job result עם target paths ו־completed steps.</li>
          <li>Audit log לפעולת queue.</li>
          <li>סטטוס siteCollection/provisioning/permissions.</li>
          <li>Health metadata על ספריות, קבצים והרשאות.</li>
        </ul>
      </section>
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>אזהרות</h3>
        <ul className="space-y-1 text-sm muted">
          <li>אם backend SharePoint auth לא מוגדר, ה־Job לא ירוץ ויוצג blocker.</li>
          <li>אם SharePoint דורש SSO בדפדפן, יש להשתמש ב־Bootstrap URL מתוך התוכנית.</li>
          <li>הפעולה אינה מדלגת על בדיקות הרשאה של SharePoint.</li>
        </ul>
      </section>
    </div>
  );

  const renderChoice = () => (
    <div className="grid gap-4 p-5 md:grid-cols-2">
      <button type="button" className="soft-panel p-5 text-right transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" onClick={() => selectFlow("track-existing")}>
        <FolderCheck className="mb-4 text-[var(--accent)]" size={28} />
        <h3 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>הוסף אתר קיים</h3>
        <p className="mt-2 text-sm muted">האתר כבר קיים. ה־HUB רק יתחיל לעקוב אחריו.</p>
        <span className="btn btn-primary mt-5 inline-flex">המשך להוספת אתר קיים</span>
      </button>
      <button type="button" className="soft-panel p-5 text-right transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" onClick={() => selectFlow("create-new")}>
        <Sparkles className="mb-4 text-[var(--accent)]" size={28} />
        <h3 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>צור אתר חדש</h3>
        <p className="mt-2 text-sm muted">הקמת אתר Site Builder חדש, כולל קבצים, הרשאות ופריסה ראשונית.</p>
        <span className="btn btn-primary mt-5 inline-flex">המשך ליצירת אתר חדש</span>
      </button>
    </div>
  );

  const renderContent = () => {
    if (flow === "choice") return renderChoice();
    if (flow === "track-existing") {
      if (trackStep === "basic") return renderBasicFields();
      if (trackStep === "connection") return renderConnectionFields(false);
      if (trackStep === "validate") return renderTrackValidate();
      return renderTrackSave();
    }

    if (createStep === "basic") return renderBasicFields();
    if (createStep === "owners") return renderOwners();
    if (createStep === "location") return renderConnectionFields(true);
    if (createStep === "plan") return renderCreatePlan();
    if (createStep === "provision") return renderProvision();
    if (createStep === "deploy") return renderDeploy();
    return renderVerification();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="surface-card flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b divider px-5 py-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-strong)" }}>{site ? "עריכת אתר" : "הוסף אתר"}<HelpIcon helpKey={flow === "create-new" ? "site.createNew" : flow === "track-existing" ? "site.addExisting" : "sites.registry"} /></h2>
              {flow === "track-existing" ? <MetadataOnlyBadge mode="metadata" /> : null}
            </div>
            <p className="text-sm muted">
              {flow === "create-new"
                ? "מסלול הקמה מלא לאתר Site Builder חדש. קודם בונים תוכנית, ורק אחר כך מריצים."
                : flow === "track-existing"
                  ? "מסלול מעקב אחרי אתר קיים. אין יצירת תיקיות, קבצים או הרשאות."
                  : "בחר אם ה־HUB יעקוב אחרי אתר קיים או יקים אתר חדש."}
            </p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור"><X size={17} /></button>
        </header>

        {flow === "create-new" ? <StepNav steps={createSteps} active={createStep} onSelect={setCreateStep} /> : null}
        {flow === "track-existing" ? <StepNav steps={trackSteps} active={trackStep} onSelect={setTrackStep} /> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {renderContent()}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t divider px-5 py-4" style={{ background: "var(--surface)" }}>
          <div className="text-xs muted">
            {flow === "create-new"
              ? "יצירת אתר תרוץ רק אחרי סקירת התוכנית. Owner mode מריץ ישירות ללא תור אישורים."
              : "הוספת אתר קיים מפעילה בדיקות קריאה בלבד ושומרת metadata ב־HUB."}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={flow === "choice" ? onClose : goBack} type="button">{flow === "choice" ? "ביטול" : activeIndex <= 0 && !site ? "חזרה לבחירה" : "הקודם"}</button>
            {flow !== "choice" && !isLastStep ? (
              <button className="btn btn-primary" onClick={goNext} type="button">הבא</button>
            ) : null}
            {flow !== "choice" && isLastStep ? (
              <button className="btn btn-primary" onClick={save} type="button" disabled={saving}>
                {saving ? "שומר..." : flow === "create-new" ? <><Plus size={16} />שמור והרץ יצירה</> : "שמור והתחל מעקב"}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
