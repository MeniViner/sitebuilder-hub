import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, FileText, FolderCheck, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import type { MongoSiteCreationPlan, OperationCapabilities, Release, WhoAmIResult } from "../api/sitesApi";
import { Site, SiteStatus } from "../types/site";
import {
  compatibleReleasesForStorage,
  deployableUnknownCompatibilityReleases,
  getReleaseArtifactCompatibility,
  latestCompatibleRelease,
  type InitialDeployStorage
} from "../utils/artifactCompatibility";
import { completeArmyEmail, completeArmyEmailsInAdminsText } from "../utils/armyEmail";
import { deriveClientOwnerMode } from "../utils/authOwnerMode";
import { releaseDisplayLabel, releaseOptionLabel } from "../utils/releaseLabels";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { LinkRow as BaseLinkRow } from "./LinkRow";
import { MetadataOnlyBadge } from "./MetadataOnlyBadge";
import { ModeBoundary } from "./OperationalSummary";
import { HelpIcon } from "./help/HelpIcon";
import { HelpLabel } from "./help/HelpLabel";
import {
  DEFAULT_BUILDER_API_KEY_REF,
  GENERATED_SAFE_COLLECTION_LABEL,
  humanizeMongoCreateBlocker,
  humanizeMongoCreateExecutionClass,
  humanizeMongoCreateStepLabel
} from "../utils/mongoCreateUx";

type FlowKey = "track-existing" | "create-new";
type Errors = Partial<Record<keyof Site | "initialAdmins" | "ownerMode" | "initialDeploy", string>>;
type TrackStepKey = "basic" | "connection" | "detect" | "validate" | "save";
type CreateStepKey = "storage" | "basic" | "owners" | "location" | "plan" | "provision" | "deploy" | "verification";
type AuthUser = NonNullable<WhoAmIResult["user"]>;

type BootstrapOptions = {
  owner?: string;
  runProvisioning?: boolean;
  runPermissionsSetup?: boolean;
  reason?: string;
};

export type InitialDeploySelection = {
  mode: "auto" | "manual" | "skip";
  releaseId?: string;
  releaseVersion?: string;
  allowUnknownCompatibility?: boolean;
};

export type SiteFormSaveOptions = {
  flow: FlowKey;
  bootstrapSharePoint: boolean;
  runReadOnlyValidation: boolean;
  mongoNativeCreation: boolean;
  bootstrapOptions?: BootstrapOptions;
  initialDeploy?: InitialDeploySelection;
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
  storageBackend: "unknown",
  builderSiteId: "",
  lifecycleStatus: "draft",
  creationMode: "unknown",
  provisioningStatus: "unknown",
  unitName: "",
  sharePointSiteUrl: "",
  finalAppUrl: "",
  runtimeConfigPath: "",
  runtimeConfigUrl: "",
  backendApiUrl: "",
  builderApiKeyRef: "",
  mongoEnvironment: "",
  mongoDatabase: "",
  mongoSiteId: "",
  safeCollectionName: "",
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
  { key: "detect", label: "זיהוי אוטומטי", hint: "runtime config ונתיבים" },
  { key: "validate", label: "בדיקה", hint: "קריאה בלבד וללא יצירה" },
  { key: "save", label: "שמירה ומעקב", hint: "שמירה ב־HUB" }
];

const createSteps: { key: CreateStepKey; label: string; hint: string }[] = [
  { key: "storage", label: "סוג אתר", hint: "Mongo או TXT" },
  { key: "basic", label: "פרטים בסיסיים", hint: "שם, קוד וסביבה" },
  { key: "owners", label: "בעלים ומנהלים", hint: "אתחול users_data" },
  { key: "location", label: "יעד SharePoint", hint: "אתר, ספריות ונתיבים" },
  { key: "plan", label: "תוכנית הקמה", hint: "סקירה לפני ביצוע" },
  { key: "provision", label: "יצירה והקמה", hint: "siteDB, קבצים והרשאות" },
  { key: "deploy", label: "פריסה ראשונית", hint: "רק אחרי תשתית" },
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

const LinkRow = (props: ComponentProps<typeof BaseLinkRow>) => <BaseLinkRow {...props} showCopy={false} />;

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = "text",
  helper,
  helpKey,
  onBlur
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
  helper?: string;
  helpKey?: string;
  onBlur?: () => void;
}) {
  return (
    <label className="block text-sm">
      <span className="field-label"><HelpLabel helpKey={helpKey}>{label}</HelpLabel></span>
      <input className="control" type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-invalid={Boolean(error)} />
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
    <div className="grid gap-2 border-b divider p-4 md:grid-cols-4 xl:grid-cols-8">
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
      return { displayName, personalNumber, email: email ? completeArmyEmail(email) : email };
    });

const hasValidEmail = (value?: string) => !value?.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const asUrlPath = (value?: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).pathname.replace(/\/+$/g, "");
  } catch {
    return trimmed.startsWith("/") ? trimmed.replace(/\/+$/g, "") : "";
  }
};
const isLikelyRawSecret = (value?: string) => {
  const trimmed = String(value || "").trim();
  return trimmed.length >= 32 && /^[A-Za-z0-9_\-.=:/+]+$/.test(trimmed) && !/^[A-Z0-9_]+$/.test(trimmed);
};
const normalizeBuilderUrl = (value?: string) => String(value || "").trim().replace(/\/+$/g, "");
const isLocalBuilderUrl = (value?: string) => {
  const trimmed = normalizeBuilderUrl(value);
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return /(^https?:\/\/)?(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(trimmed);
  }
};
const displayBackendHost = (value?: string) => {
  const trimmed = normalizeBuilderUrl(value);
  if (!trimmed) return "-";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/[?#].*$/g, "");
  }
};
const isProductionSite = (environment?: string) => String(environment || "").trim().toLowerCase() === "production";
const builderBackendOptionsFromConfig = (config?: OperationCapabilities["builderBackendConfig"] | null) =>
  config?.builderBackendOptions || [];
const chooseBuilderBackendOption = (
  config: OperationCapabilities["builderBackendConfig"] | null | undefined,
  environment?: string
) => {
  const options = builderBackendOptionsFromConfig(config);
  if (options.length === 0) return null;
  if (isProductionSite(environment)) {
    return (
      options.find((option) => option.default && option.environment === "production" && !option.localhost) ||
      options.find((option) => option.environment === "production" && !option.localhost) ||
      options.find((option) => option.default && !option.localhost) ||
      options.find((option) => !option.localhost) ||
      null
    );
  }
  return (
    options.find((option) => option.default) ||
    (options.length === 1 ? options[0] : null)
  );
};

export function SiteFormModal({
  open,
  site,
  authUser,
  builderBackendConfig,
  releases = [],
  releasesLoading = false,
  onRefreshReleases,
  onClose,
  onSave,
  onPlanMongoCreate
}: {
  open: boolean;
  site?: Site | null;
  authUser?: AuthUser | null;
  builderBackendConfig?: OperationCapabilities["builderBackendConfig"] | null;
  releases?: Release[];
  releasesLoading?: boolean;
  onRefreshReleases?: () => Promise<void> | void;
  onClose: () => void;
  onSave: (payload: Partial<Site>, options: SiteFormSaveOptions) => Promise<void>;
  onPlanMongoCreate?: (payload: Partial<Site>) => Promise<MongoSiteCreationPlan>;
}) {
  const [form, setForm] = useState<Partial<Site>>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [flow, setFlow] = useState<FlowKey | "choice">("choice");
  const [trackStep, setTrackStep] = useState<TrackStepKey>("basic");
  const [createStep, setCreateStep] = useState<CreateStepKey>("storage");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [initialAdminsText, setInitialAdminsText] = useState("");
  const [mongoPlan, setMongoPlan] = useState<MongoSiteCreationPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [emailCompletionNotice, setEmailCompletionNotice] = useState("");
  const [detectionNotice, setDetectionNotice] = useState("");
  const [initialDeployMode, setInitialDeployMode] = useState<InitialDeploySelection["mode"]>("auto");
  const [initialDeployReleaseId, setInitialDeployReleaseId] = useState("");
  const [allowUnknownInitialDeployRelease, setAllowUnknownInitialDeployRelease] = useState(false);

  useEffect(() => {
    setForm(site ? { ...initialForm, ...site } : initialForm);
    setErrors({});
    setFlow(site ? "track-existing" : "choice");
    setTrackStep("basic");
    setCreateStep("storage");
    setSaving(false);
    setSaveError("");
    setMongoPlan(null);
    setPlanning(false);
    setPlanError("");
    setEmailCompletionNotice("");
    setDetectionNotice("");
    setInitialDeployMode("auto");
    setInitialDeployReleaseId("");
    setAllowUnknownInitialDeployRelease(false);
    setInitialAdminsText(serializeAdmins(site?.txtAdmins));
  }, [site, open]);

  const resolvedPreview = useMemo(() => resolveSiteBuilderPaths(form), [form]);
  const parsedInitialAdmins = useMemo(() => parseAdmins(initialAdminsText), [initialAdminsText]);
  const ownerMode = useMemo(() => deriveClientOwnerMode(authUser), [authUser]);
  const builderBackendOptions = useMemo(() => builderBackendOptionsFromConfig(builderBackendConfig), [builderBackendConfig]);
  const selectedBuilderBackendOption = useMemo(() => {
    const selectedUrl = normalizeBuilderUrl(form.backendApiUrl);
    return builderBackendOptions.find((option) => normalizeBuilderUrl(option.backendApiUrl) === selectedUrl) || null;
  }, [builderBackendOptions, form.backendApiUrl]);
  const suggestedBuilderBackendOption = useMemo(
    () => chooseBuilderBackendOption(builderBackendConfig, form.environment),
    [builderBackendConfig, form.environment]
  );
  const productionLocalhostBlocked = form.storageBackend === "mongo" && isProductionSite(form.environment) && isLocalBuilderUrl(form.backendApiUrl);
  const initialDeployStorage: InitialDeployStorage = form.storageBackend === "txt" ? "txt" : "mongo";
  const compatibleInitialDeployReleases = useMemo(
    () => compatibleReleasesForStorage(releases, initialDeployStorage),
    [releases, initialDeployStorage]
  );
  const unknownInitialDeployReleases = useMemo(
    () => deployableUnknownCompatibilityReleases(releases),
    [releases]
  );
  const autoInitialDeployRelease = useMemo(
    () => latestCompatibleRelease(releases, initialDeployStorage),
    [releases, initialDeployStorage]
  );
  const initialDeployOptions = useMemo(
    () => allowUnknownInitialDeployRelease
      ? [...compatibleInitialDeployReleases, ...unknownInitialDeployReleases]
      : compatibleInitialDeployReleases,
    [allowUnknownInitialDeployRelease, compatibleInitialDeployReleases, unknownInitialDeployReleases]
  );
  const selectedInitialDeployRelease = useMemo(() => {
    if (initialDeployMode === "skip") return null;
    if (initialDeployMode === "auto") return autoInitialDeployRelease;
    return initialDeployOptions.find((release) => release._id === initialDeployReleaseId) || null;
  }, [autoInitialDeployRelease, initialDeployMode, initialDeployOptions, initialDeployReleaseId]);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => {
      if (prev.storageBackend !== "mongo" || prev.backendApiUrl?.trim()) return prev;
      const option = chooseBuilderBackendOption(builderBackendConfig, prev.environment);
      if (!option || (isProductionSite(prev.environment) && option.localhost)) return prev;
      return {
        ...prev,
        backendApiUrl: option.backendApiUrl,
        builderApiKeyRef: prev.builderApiKeyRef || option.credentialRef || builderBackendConfig?.defaultBuilderApiKeyRef || DEFAULT_BUILDER_API_KEY_REF
      };
    });
  }, [open, builderBackendConfig, form.storageBackend, form.environment]);

  useEffect(() => {
    if (!open || flow !== "create-new") return;
    if (initialDeployMode === "auto") {
      setInitialDeployReleaseId(autoInitialDeployRelease?._id || "");
    } else if (initialDeployMode === "manual" && initialDeployReleaseId && !initialDeployOptions.some((release) => release._id === initialDeployReleaseId)) {
      setInitialDeployReleaseId("");
    }
  }, [autoInitialDeployRelease, flow, initialDeployMode, initialDeployOptions, initialDeployReleaseId, open]);

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
      setCreateStep("storage");
      setForm((prev) => ({
        ...prev,
        status: "draft",
        storageBackend: "unknown",
        backendApiUrl: "",
        builderApiKeyRef: "",
        mongoSiteId: "",
        safeCollectionName: "",
        mongoEnvironment: "",
        mongoDatabase: "",
        creationMode: "create-new",
        provisioningStatus: "planned",
        lifecycleStatus: "draft"
      }));
    }
  };

  const applyBuilderBackendOption = (backendApiUrl: string) => {
    const option = builderBackendOptions.find((item) => item.backendApiUrl === backendApiUrl);
    setForm((prev) => ({
      ...prev,
      backendApiUrl,
      builderApiKeyRef: option?.credentialRef || prev.builderApiKeyRef || builderBackendConfig?.defaultBuilderApiKeyRef || DEFAULT_BUILDER_API_KEY_REF
    }));
  };

  const chooseCreateStorageBackend = (storageBackend: "mongo" | "txt") => {
    setErrors(({ storageBackend: _storageBackend, ...rest }) => rest);
    setMongoPlan(null);
    setPlanError("");
    setInitialDeployReleaseId("");
    setAllowUnknownInitialDeployRelease(false);
    setForm((prev) => {
      if (storageBackend === "txt") {
        return {
          ...prev,
          storageBackend: "txt",
          authoritativeAdminSource: "txt",
          backendApiUrl: "",
          builderApiKeyRef: "",
          mongoSiteId: "",
          safeCollectionName: "",
          mongoEnvironment: "",
          mongoDatabase: ""
        };
      }

      const option = chooseBuilderBackendOption(builderBackendConfig, prev.environment);
      return {
        ...prev,
        storageBackend: "mongo",
        authoritativeAdminSource: "mongo",
        builderSiteId: prev.builderSiteId || prev.siteCode,
        mongoSiteId: prev.mongoSiteId || prev.builderSiteId || prev.siteCode,
        backendApiUrl: prev.backendApiUrl || (!option || (isProductionSite(prev.environment) && option.localhost) ? "" : option.backendApiUrl),
        builderApiKeyRef: prev.builderApiKeyRef || option?.credentialRef || builderBackendConfig?.defaultBuilderApiKeyRef || DEFAULT_BUILDER_API_KEY_REF
      };
    });
  };

  const completeOwnerEmail = () => {
    const completed = completeArmyEmail(form.ownerEmail || "");
    if (completed && completed !== String(form.ownerEmail || "").trim()) {
      setForm((prev) => ({ ...prev, ownerEmail: completed }));
      setEmailCompletionNotice("הושלם אוטומטית למייל צבאי.");
    }
  };

  const completeInitialAdminEmails = () => {
    const completed = completeArmyEmailsInAdminsText(initialAdminsText);
    if (completed !== initialAdminsText) {
      setInitialAdminsText(completed);
      setEmailCompletionNotice("הושלם אוטומטית למייל צבאי.");
    }
  };

  const applyDetectedDefaults = () => {
    const paths = resolveSiteBuilderPaths(form);
    const option = selectedBuilderBackendOption || suggestedBuilderBackendOption;
    setForm((prev) => ({
      ...prev,
      sharePointSiteUrl: prev.sharePointSiteUrl || paths?.sharePointSiteUrl || "",
      finalAppUrl: prev.finalAppUrl || paths?.finalAppUrl || "",
      runtimeConfigPath: prev.runtimeConfigPath || paths?.runtimeConfigPath || "",
      runtimeConfigUrl: prev.runtimeConfigUrl || paths?.runtimeConfigUrl || "",
      backendApiUrl: prev.backendApiUrl || option?.backendApiUrl || "",
      builderApiKeyRef: prev.builderApiKeyRef || option?.credentialRef || builderBackendConfig?.defaultBuilderApiKeyRef || DEFAULT_BUILDER_API_KEY_REF,
      builderSiteId: prev.builderSiteId || prev.mongoSiteId || prev.siteCode,
      mongoSiteId: prev.mongoSiteId || prev.builderSiteId || prev.siteCode
    }));
    setDetectionNotice("המערכת הציעה ערכים לפי כתובת SharePoint, קוד האתר והגדרות ה־HUB.");
  };

  const applyRuntimeConfigStatus = () => {
    const runtime = form.runtimeConfigStatus || site?.runtimeConfigStatus;
    if (!runtime) {
      setDetectionNotice("לא זוהה runtime config קיים עדיין. אפשר לשמור את האתר ואז להריץ בדיקת קריאה בלבד.");
      return;
    }
    setForm((prev) => ({
      ...prev,
      storageBackend: (runtime.storageBackend as Site["storageBackend"]) || prev.storageBackend,
      backendApiUrl: runtime.backendApiUrl || prev.backendApiUrl,
      builderSiteId: runtime.builderSiteId || prev.builderSiteId,
      mongoSiteId: runtime.builderSiteId || prev.mongoSiteId,
      runtimeConfigPath: runtime.path || prev.runtimeConfigPath,
      runtimeConfigUrl: runtime.url || prev.runtimeConfigUrl
    }));
    setDetectionNotice("המערכת זיהתה runtime config קיים והעתיקה ממנו ערכים ידועים.");
  };

  const validate = (targetFlow: FlowKey): Errors => {
    const next: Errors = {};
    if (!form.displayName?.trim()) next.displayName = "חסר שם אתר. השם מוצג לבעלים, בדוחות וב־Audit, ולכן צריך להיות ברור. הזינו שם עסקי, למשל: פורטל משאבי אנוש.";
    if (!form.siteCode?.trim()) next.siteCode = "חסר קוד אתר / נתיב SharePoint. בלעדיו המערכת לא יכולה לחשב ספריות, runtime config וקישור סופי. הזינו קוד קצר, למשל: hr-portal.";
    if (!form.sharePointSiteUrl?.trim()) next.sharePointSiteUrl = "חסרה כתובת אתר SharePoint. SharePoint מארח את קבצי האתר גם באתר Mongo. הזינו כתובת מלאה, למשל: https://portal.army.idf/sites/hr-portal.";

    if (form.sharePointSiteUrl?.trim()) {
      try { new URL(form.sharePointSiteUrl); } catch { next.sharePointSiteUrl = "כתובת SharePoint לא תקינה. הכתובת משמשת לחישוב siteDB, dist ו־runtime config. הזינו URL מלא שמתחיל ב־https://."; }
    }
    if (form.finalAppUrl?.trim()) {
      try { new URL(form.finalAppUrl); } catch { next.finalAppUrl = "קישור סופי לא תקין. זה הקישור שהמשתמשים יפתחו אחרי הפריסה. הזינו URL מלא ל־index.html או השאירו ריק כדי שהמערכת תחשב אותו."; }
    }
    if (!hasValidEmail(completeArmyEmail(form.ownerEmail || ""))) next.ownerEmail = "מייל בעל האתר לא תקין. המייל משמש לזיהוי והרשאות ראשוניות. תקנו לכתובת מלאה, למשל: owner@example.com.";

    if (targetFlow === "create-new") {
      if (form.storageBackend !== "mongo" && form.storageBackend !== "txt") {
        next.storageBackend = "בחרו אם האתר החדש משתמש ב־Mongo או בקבצי TXT. אחרי הבחירה האשף יציג רק את השדות הרלוונטיים.";
      }
      if (!form.ownerPersonalNumber?.trim()) next.ownerPersonalNumber = "חסר מספר אישי של בעל האתר. בלי זה אי אפשר לאתחל בעלים/מנהלים בצורה אמינה. הזינו מספר אישי תקין של בעל האתר.";
      if (!completeArmyEmail(form.ownerEmail || "").trim()) next.ownerEmail = "חסר מייל בעל האתר. המייל נדרש לבעלות והרשאות ראשוניות. הזינו מייל ארגוני תקין.";
      if (initialDeployMode !== "skip" && !selectedInitialDeployRelease) {
        next.initialDeploy = form.storageBackend === "txt"
          ? "אין Release מתאים לאתר TXT legacy."
          : "אין Release מתאים לאתר Mongo. צור או סמן Release כתואם Mongo לפני פריסה ראשונית.";
      }
      if (form.storageBackend === "mongo") {
        if (!(form.builderSiteId || form.mongoSiteId || form.siteCode)?.trim()) next.builderSiteId = "חסר מזהה אתר במערכת Site Builder. זה ה־siteId שהאתר שולח ל־API. הזינו מזהה יציב, למשל: hr-portal.";
        if (builderBackendOptions.length === 0) {
          next.backendApiUrl = "לא מוגדר Backend של Site Builder לסביבה הזאת. יש להגדיר SITE_BUILDER_DEFAULT_BACKEND_API_URL או לבחור Backend מתוך ההגדרות.";
        } else if (!form.backendApiUrl?.trim()) {
          next.backendApiUrl = "בחרו Backend של Site Builder מתוך ההגדרות. אם יש כמה backends, צריך לבחור אחד לפני יצירת תוכנית.";
        } else {
          try { new URL(form.backendApiUrl); } catch { next.backendApiUrl = "כתובת Backend של Site Builder לא תקינה. זו כתובת API, לא SharePoint. הזינו URL מלא שמתחיל ב־http:// או https://."; }
        }
        if (productionLocalhostBlocked) next.backendApiUrl = "לא ניתן להשתמש ב־localhost עבור אתר production/classified. בחרו Backend ייצור שמוגדר ב־HUB.";
        if (!form.builderApiKeyRef?.trim()) next.builderApiKeyRef = "חסרה הפניה להרשאת API. בלי זה ה־HUB לא יכול ליצור registry או seed docs ב־Builder backend. בחרו credential reference קיים, למשל SITE_BUILDER_BACKEND_API_KEY.";
        if (isLikelyRawSecret(form.builderApiKeyRef)) next.builderApiKeyRef = "נראה שהוזן API key גלוי במקום credential reference. כדי לא לחשוף סודות במסך או בלוגים, הזינו רק שם הגדרה, למשל SITE_BUILDER_BACKEND_API_KEY.";
        if (form.safeCollectionName?.trim() && !/^[a-z][a-z0-9_]{2,62}$/.test(form.safeCollectionName.trim())) {
          next.safeCollectionName = "שם Collection במונגו לא תקין. השתמשו באותיות קטנות באנגלית, מספרים וקו תחתון בלבד, למשל: site_hr_portal, או השאירו ריק ליצירה אוטומטית.";
        }
        const runtimePath = asUrlPath(form.runtimeConfigPath);
        if (runtimePath && resolvedPreview?.siteRoot && !runtimePath.startsWith(resolvedPreview.siteRoot)) {
          next.runtimeConfigPath = `נתיב runtime config לא תקין. הקובץ חייב להיות בתוך תיקיית האתר ב־SharePoint, למשל: ${resolvedPreview.runtimeConfigPath}`;
        }
        if (!ownerMode.ownerMode) {
          next.ownerMode = `Owner mode לא פעיל ולכן אי אפשר ליצור אתר Mongo חדש. ${ownerMode.ownerModeReason}`;
        }
      }
    }

    const invalidAdmin = parsedInitialAdmins.find((admin) => admin.email && !hasValidEmail(completeArmyEmail(admin.email)));
    if (invalidAdmin) next.initialAdmins = "אחד ממיילי המנהלים הראשוניים לא תקין. בלי מייל תקין ההרשאות וה־seed docs עלולים להיווצר לא נכון. תקנו את השורה או השאירו בה רק שם ומספר אישי.";
    return next;
  };

  const buildPayload = (targetFlow: FlowKey): Partial<Site> => {
    const paths = resolveSiteBuilderPaths(form);
    const backendOption = selectedBuilderBackendOption || suggestedBuilderBackendOption;
    const usesMongo = form.storageBackend === "mongo";
    return {
      ...form,
      status: site ? form.status : targetFlow === "track-existing" ? "active" : "draft",
      creationMode: site ? form.creationMode : targetFlow,
      provisioningStatus: form.provisioningStatus || (targetFlow === "create-new" ? "planned" : "unknown"),
      lifecycleStatus: form.storageBackend === "mongo" && !site ? "draft" : form.lifecycleStatus,
      authoritativeAdminSource: form.storageBackend === "mongo" ? "mongo" : form.storageBackend === "txt" ? "txt" : "unknown",
      builderSiteId: usesMongo ? form.builderSiteId || form.mongoSiteId || form.siteCode : form.builderSiteId || "",
      mongoSiteId: usesMongo ? form.mongoSiteId || form.builderSiteId || form.siteCode : "",
      sharePointHost: paths?.host || form.sharePointHost,
      sharePointSiteUrl: form.sharePointSiteUrl || paths?.sharePointSiteUrl || "",
      finalAppUrl: form.finalAppUrl || paths?.finalAppUrl || "",
      bootstrapUrl: paths?.bootstrapUrl || form.bootstrapUrl || "",
      runtimeConfigPath: usesMongo ? form.runtimeConfigPath || paths?.runtimeConfigPath || "" : "",
      runtimeConfigUrl: usesMongo ? form.runtimeConfigUrl || paths?.runtimeConfigUrl || "" : "",
      backendApiUrl: usesMongo ? form.backendApiUrl || backendOption?.backendApiUrl || "" : "",
      builderApiKeyRef: usesMongo ? form.builderApiKeyRef || backendOption?.credentialRef || builderBackendConfig?.defaultBuilderApiKeyRef || "" : "",
      safeCollectionName: usesMongo ? form.safeCollectionName : "",
      mongoEnvironment: usesMongo ? form.mongoEnvironment : "",
      mongoDatabase: usesMongo ? form.mongoDatabase : "",
      ownerEmail: completeArmyEmail(form.ownerEmail || ""),
      txtAdmins: parsedInitialAdmins.map((admin) => ({
        ...admin,
        email: admin.email ? completeArmyEmail(admin.email) : admin.email
      }))
    };
  };

  const generateMongoPlan = async () => {
    if (!onPlanMongoCreate) return;
    const nextErrors = validate("create-new");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setPlanning(true);
    setPlanError("");
    try {
      const plan = await onPlanMongoCreate(buildPayload("create-new"));
      setMongoPlan(plan);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "יצירת תוכנית Mongo נכשלה");
    } finally {
      setPlanning(false);
    }
  };

  const save = async () => {
    const targetFlow = flow === "choice" ? "track-existing" : flow;
    const nextErrors = validate(targetFlow);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSaveError("");
    try {
      await onSave(buildPayload(targetFlow), {
        flow: targetFlow,
        bootstrapSharePoint: !site && targetFlow === "create-new" && form.storageBackend !== "mongo",
        runReadOnlyValidation: !site && targetFlow === "track-existing",
        mongoNativeCreation: !site && targetFlow === "create-new" && form.storageBackend === "mongo",
        initialDeploy: targetFlow === "create-new"
          ? {
              mode: initialDeployMode,
              releaseId: selectedInitialDeployRelease?._id,
              releaseVersion: selectedInitialDeployRelease?.version,
              allowUnknownCompatibility: allowUnknownInitialDeployRelease && Boolean(selectedInitialDeployRelease)
            }
          : undefined,
        bootstrapOptions: targetFlow === "create-new"
          ? {
              owner: completeArmyEmail(form.ownerEmail || ""),
              runProvisioning: true,
              runPermissionsSetup: true,
              reason: "Create new Site Builder site from Hub"
            }
          : undefined
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "שמירת האתר נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const currentSteps = flow === "create-new" ? createSteps : trackSteps;
  const activeStep = flow === "create-new" ? createStep : trackStep;
  const activeIndex = currentSteps.findIndex((step) => step.key === activeStep);
  const isLastStep = activeIndex === currentSteps.length - 1;
  const createStorageSelected = form.storageBackend === "mongo" || form.storageBackend === "txt";
  const nextDisabled = flow === "create-new" && activeStep === "storage" && !createStorageSelected;

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
    if (flow === "create-new" && activeStep === "storage" && !createStorageSelected) {
      setErrors((prev) => ({
        ...prev,
        storageBackend: "בחרו סוג אתר כדי שהאשף יציג רק את השדות הנכונים."
      }));
      return;
    }
    const targetFlow = flow;
    const nextErrors = validate(targetFlow);
    if (Object.keys(nextErrors).length > 0 && (activeStep === "plan" || activeStep === "validate" || activeStep === "verification")) {
      setErrors(nextErrors);
      return;
    }
    if (flow === "create-new" && activeStep === "plan" && form.storageBackend === "mongo" && !mongoPlan) {
      setPlanError("יש ליצור תוכנית Mongo ולסקור אותה לפני המשך לביצוע.");
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

  const renderOwnerModeDiagnostics = () => (
    <section className={`soft-panel p-4 ${ownerMode.ownerMode ? "" : "border-[var(--danger)]"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>אבחון Owner mode</h3>
        <span className={`badge ${ownerMode.ownerMode ? "badge-success" : "badge-danger"}`}>ownerMode: {ownerMode.ownerMode ? "true" : "false"}</span>
      </div>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        <LinkRow label="מספר אישי נוכחי" value={authUser?.personalNumber || "-"} />
        <LinkRow label="source" value={authUser?.source || "-"} />
        <LinkRow label="identityMode" value={authUser?.identityMode || "-"} />
        <LinkRow label="role" value={authUser?.role || "-"} />
        <LinkRow label="ownerMode" value={ownerMode.ownerMode ? "true" : "false"} />
        <LinkRow label={ownerMode.ownerMode ? "סיבה" : "סיבה לחסימה"} value={ownerMode.ownerModeReason} />
      </div>
      {!ownerMode.ownerMode ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
          Owner mode לא פעיל. יצירת אתר Mongo דורשת ownerMode=true מהשרת, source=owner או identityMode=explicit-owner.
        </p>
      ) : null}
    </section>
  );

  const renderStorageChoice = () => (
    <div className="space-y-4">
      <section className="site-create-path-hero">
        <div>
          <p className="field-label">החלטה ראשונה</p>
          <h3>איזה סוג אתר אתם יוצרים?</h3>
          <p>הבחירה הזו קובעת את כל האשף: שדות, בדיקות, פריסה וחסמים. אחרי הבחירה לא יוצגו פרטים מהמסלול השני.</p>
        </div>
        <span className={`badge ${form.storageBackend === "mongo" || form.storageBackend === "txt" ? "badge-success" : "badge-warning"}`}>
          {form.storageBackend === "mongo" ? "נבחר Mongo" : form.storageBackend === "txt" ? "נבחר TXT" : "נדרשת בחירה"}
        </span>
      </section>

      <div className="site-create-type-grid">
        <button
          type="button"
          className={`site-create-type-card ${form.storageBackend === "mongo" ? "site-create-type-card-active" : ""}`}
          onClick={() => chooseCreateStorageBackend("mongo")}
        >
          <span className="site-create-type-icon"><Database size={22} /></span>
          <span className="site-create-type-copy">
            <span className="site-create-type-title">אתר Mongo חדש</span>
            <span className="site-create-type-description">הנתונים החיים נשמרים ב־Builder backend. SharePoint מארח את קבצי האתר ואת runtime config.</span>
            <span className="site-create-type-points">יוצגו: Backend, runtime config, seed, safeCollectionName, Release תואם Mongo.</span>
            <span className="site-create-type-muted">לא יוצגו: עריכת קבצי TXT כמקור אמת.</span>
          </span>
        </button>

        <button
          type="button"
          className={`site-create-type-card ${form.storageBackend === "txt" ? "site-create-type-card-active" : ""}`}
          onClick={() => chooseCreateStorageBackend("txt")}
        >
          <span className="site-create-type-icon"><FileText size={22} /></span>
          <span className="site-create-type-copy">
            <span className="site-create-type-title">אתר TXT ב־SharePoint</span>
            <span className="site-create-type-description">הנתונים נשמרים בקבצי TXT בתוך ספריות SharePoint. אין Builder backend ואין Mongo registry.</span>
            <span className="site-create-type-points">יוצגו: siteDB, siteUsersDb, קבצי TXT, Release תואם TXT.</span>
            <span className="site-create-type-muted">לא יוצגו: Backend, API key, Mongo seed או safeCollectionName.</span>
          </span>
        </button>
      </div>
      {errors.storageBackend ? <p className="text-sm" style={{ color: "var(--danger)" }}>{errors.storageBackend}</p> : null}
    </div>
  );

  const renderBasicFields = () => (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>פרטי אתר</h3>
        <div className="grid gap-3">
          <Field label="שם האתר" placeholder="לדוגמה: פורטל משאבי אנוש" value={form.displayName} error={errors.displayName} onChange={(value) => setForm((p) => ({ ...p, displayName: value }))} helpKey="create.displayName" />
          <Field label="קוד אתר / נתיב SharePoint" placeholder="לדוגמה: hr-portal" value={form.siteCode} error={errors.siteCode} onChange={applySiteCodeDefaults} helper="המערכת משתמשת בקוד כדי להציע נתיבי SharePoint. הזהות הייחודית נקבעת לפי היעד הפיזי ו־runtime config, לא לפי הקוד בלבד." helpKey="create.siteCode" />
          {flow === "create-new" && form.storageBackend === "mongo" ? (
            <Field label="מזהה אתר במערכת Site Builder" value={form.builderSiteId || form.mongoSiteId || ""} error={errors.builderSiteId} onChange={(value) => setForm((p) => ({ ...p, builderSiteId: value, mongoSiteId: p.mongoSiteId || value }))} placeholder={form.siteCode || "alphateam"} helper="אם ריק, המערכת תשתמש בקוד האתר כ־siteId ותציג זאת בתוכנית." helpKey="create.builderSiteId" />
          ) : null}
          <Field label="תיאור" value={form.description} onChange={(value) => setForm((p) => ({ ...p, description: value }))} helpKey="create.description" />
          <label className="block text-sm">
            <span className="field-label"><HelpLabel helpKey="create.environment">סביבת יעד</HelpLabel></span>
            <select className="control" value={form.environment || "unknown"} onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value as Site["environment"] }))}>
              <option value="unknown">Unknown</option>
              <option value="local">Local</option>
              <option value="dev">Dev</option>
              <option value="test">Test</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
          <Field label="יחידה" value={form.unitName} onChange={(value) => setForm((p) => ({ ...p, unitName: value }))} helpKey="create.unitName" />
          {flow !== "create-new" ? (
            <label className="block text-sm">
              <span className="field-label"><HelpLabel helpKey="create.storageBackend">סוג אחסון נתונים</HelpLabel></span>
              <select className="control" value={form.storageBackend || "unknown"} onChange={(e) => setForm((p) => ({ ...p, storageBackend: e.target.value as Site["storageBackend"] }))}>
                <option value="unknown">Unknown / לא זוהה עדיין</option>
                <option value="txt">TXT ב־SharePoint</option>
                <option value="mongo">Mongo דרך Builder backend</option>
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {flow === "create-new" ? (
        <div className="space-y-5">
          {form.storageBackend === "mongo" ? renderOwnerModeDiagnostics() : (
            <section className="soft-panel p-4">
              <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מסלול TXT נקי</h3>
              <div className="space-y-2 text-sm muted">
                <p>האתר יישמר כטיוטה, ייצור ספריות SharePoint וקבצי TXT ראשוניים, ואז יבחר Release שתואם ל־TXT.</p>
                <p>לא נדרש Builder backend, API key, runtime config או Mongo seed במסלול הזה.</p>
              </div>
            </section>
          )}
          <section className="soft-panel p-4">
            <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מה המערכת קובעת אוטומטית</h3>
            <div className="space-y-3 text-sm muted">
              <p>האתר יישמר תחילה כטיוטה מתוכננת, כדי שאפשר יהיה לראות חסמים לפני כתיבה.</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge badge-info">סטטוס: טיוטה</span>
                <span className="badge badge-info">Provisioning: planned</span>
                <span className="badge badge-success">{form.storageBackend === "mongo" ? "נתונים: Mongo" : "נתונים: TXT legacy"}</span>
                <span className="badge badge-neutral">אירוח: SharePoint</span>
              </div>
              <p>{form.storageBackend === "mongo" ? "שדות כמו runtime config ו־safeCollectionName יוצעו אוטומטית במסלול Mongo." : "ספריות וקבצי TXT יחושבו אוטומטית לפי קוד האתר וכתובת SharePoint."}</p>
            </div>
          </section>
        </div>
      ) : (
        <section className="soft-panel p-4">
          <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מחזור חיים</h3>
          <div className="grid gap-3">
            <label className="block text-sm">
              <span className="field-label"><HelpLabel helpKey="create.status">סטטוס</HelpLabel></span>
              <select className="control" value={form.status || "draft"} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SiteStatus }))}>
                <option value="draft">טיוטה</option>
                <option value="active">פעיל</option>
                <option value="warning">אזהרה</option>
                <option value="failed">נכשל</option>
                <option value="archived">בארכיון</option>
              </select>
            </label>
            <Field label="גרסה נוכחית" value={form.version} onChange={(value) => setForm((p) => ({ ...p, version: value }))} helpKey="create.version" />
            <label className="block text-sm">
              <span className="field-label"><HelpLabel helpKey="create.notes">הערות</HelpLabel></span>
              <textarea className="control min-h-28" value={form.notes || ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
        </section>
      )}
    </div>
  );

  const renderGeneratedDefaultsPreview = () => (
    <section className="soft-panel p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>ערכים שהמערכת מחשבת עבורך</h3>
          <p className="mt-1 text-xs muted">{form.storageBackend === "mongo" ? "ברירות מחדל לאירוח SharePoint + חיבור Mongo." : "ברירות מחדל לספריות וקבצי TXT ב־SharePoint."}</p>
        </div>
        <span className="badge badge-info">Generated preview</span>
      </div>
      {resolvedPreview ? (
        <div>
          <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs" style={{ color: "var(--text-strong)" }}>
            {form.storageBackend === "mongo"
              ? "זהות ייחודית ב־HUB: כתובת SharePoint + נתיב siteDB + נתיב siteUsersDb + runtime config."
              : "זהות ייחודית ב־HUB: כתובת SharePoint + נתיב siteDB + נתיב siteUsersDb."}
          </div>
          <LinkRow label="קישור סופי לאתר" value={form.finalAppUrl || resolvedPreview.finalAppUrl} isUrl description="הכתובת שהמשתמשים יפתחו אחרי פריסה ואימות index.html" />
          <LinkRow label="נתיב siteDB מחושב" value={resolvedPreview.siteDbRoot} description="אירוח dist, assets וקבצי תאימות ב־SharePoint" />
          <LinkRow label="נתיב siteUsersDb מחושב" value={resolvedPreview.usersDbRoot} description={form.storageBackend === "mongo" ? "תאימות והרשאות; מקור האמת לנתוני האפליקציה הוא Mongo" : "מקור קבצי המשתמשים וההרשאות לאתר TXT"} />
          <LinkRow label="תיקיית dist" value={resolvedPreview.finalDistRoot} description="כאן אמורים להיות index.html וקבצי האפליקציה" />
          {form.storageBackend === "mongo" ? (
            <>
              <LinkRow label="נתיב runtime config" value={form.runtimeConfigPath || resolvedPreview.runtimeConfigPath} description="קובץ שמכוון את ה־Frontend לעבוד מול Mongo backend" />
              <LinkRow label="שם Collection במונגו" value={form.safeCollectionName || GENERATED_SAFE_COLLECTION_LABEL} description="אם ריק, Builder backend ייצור שם בטוח ויחזיר אותו ל־HUB" />
            </>
          ) : (
            <>
              <LinkRow label="users_data.txt" value={resolvedPreview.txtFiles.users} description="קובץ משתמשים ומנהלים ראשוני" />
              <LinkRow label="bihs_master_config_v1.txt" value={resolvedPreview.txtFiles.masterConfig} description="קובץ הגדרות בסיסי לאתר TXT" />
            </>
          )}
        </div>
      ) : (
        <p className="text-sm muted">יש להזין קוד אתר כדי לחשב נתיבים ותצוגה מקדימה.</p>
      )}
    </section>
  );

  const renderAdvancedInfrastructureFields = (createMode = false) => (
    <details className="advanced-settings">
      <summary>
        <span className="font-bold" style={{ color: "var(--text-strong)" }}>הגדרות מתקדמות</span>
        <span className="text-xs muted">שדות תשתית שהמערכת ממלאת לבד. שינוי ידני מיועד למצבים חריגים.</span>
      </summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="קישור סופי לאתר" value={form.finalAppUrl || ""} error={errors.finalAppUrl} onChange={(value) => setForm((p) => ({ ...p, finalAppUrl: value }))} placeholder={resolvedPreview?.finalAppUrl} helper="אם ריק, המערכת משתמשת ב־dist/index.html המחושב." helpKey="create.finalAppUrl" />
        {form.storageBackend === "mongo" ? (
          <>
            <Field label="Backend של Site Builder" value={form.backendApiUrl || ""} error={errors.backendApiUrl} onChange={(value) => setForm((p) => ({ ...p, backendApiUrl: value }))} placeholder="נבחר אוטומטית מהגדרות ה־HUB" helper="Override מתקדם בלבד. בסביבה רגילה בוחרים Backend מתוך הגדרות ה־HUB, ולא מזינים כאן סוד או API key." helpKey="create.backendApiUrl" />
            <Field label="מזהה אתר במערכת Site Builder" value={form.builderSiteId || form.mongoSiteId || ""} error={errors.builderSiteId} onChange={(value) => setForm((p) => ({ ...p, builderSiteId: value, mongoSiteId: p.mongoSiteId || value }))} placeholder={form.siteCode || "alphateam"} helper="ניתן לעריכה בהגדרות מתקדמות. אם ריק, המערכת מציעה את קוד האתר." helpKey="create.builderSiteId" />
          </>
        ) : null}
        {!(createMode && form.storageBackend === "txt") ? (
          <>
            <Field label="ספריית siteDB" value={form.siteDbLibrary} onChange={(value) => setForm((p) => ({ ...p, siteDbLibrary: value }))} helper="ברירת מחדל: siteDB. לא משנים בלי סיבה תפעולית." helpKey="create.siteDbLibrary" />
            <Field label="ספריית siteUsersDb" value={form.usersDbLibrary} onChange={(value) => setForm((p) => ({ ...p, usersDbLibrary: value }))} helper="ברירת מחדל: siteUsersDb. משמשת לתאימות והרשאות." helpKey="create.usersDbLibrary" />
          </>
        ) : null}
        <Field label="ספריית Bootstrap" value={form.bootstrapLibrary} onChange={(value) => setForm((p) => ({ ...p, bootstrapLibrary: value }))} helper="ברירת מחדל: SiteAssets. זה לא מיקום האתר הסופי." helpKey="create.bootstrapLibrary" />
        <Field label="תיקיית Bootstrap" value={form.bootstrapFolder} onChange={(value) => setForm((p) => ({ ...p, bootstrapFolder: value }))} helper="מיקום זמני לקבצי הקמה או עזר לפני שהאתר הסופי מוכן." helpKey="create.bootstrapFolder" />
        {form.storageBackend === "mongo" ? (
          <>
            <Field label="נתיב runtime config" value={form.runtimeConfigPath || ""} error={errors.runtimeConfigPath} onChange={(value) => setForm((p) => ({ ...p, runtimeConfigPath: value }))} placeholder={resolvedPreview?.runtimeConfigPath} helper="השאירו ריק כדי ליצור אוטומטית בתוך dist. ערך שגוי יגרום לאתר לעלות בלי לדעת מאיפה לטעון נתונים." helpKey="create.runtimeConfigPath" />
            <Field label="הפניה להרשאת API" value={form.builderApiKeyRef || ""} error={errors.builderApiKeyRef} onChange={(value) => setForm((p) => ({ ...p, builderApiKeyRef: value }))} placeholder={DEFAULT_BUILDER_API_KEY_REF} helper="שם הגדרה שמחזיקה את המפתח. לא מזינים כאן API key גלוי." helpKey="create.credentialRef" />
            <Field label="שם Collection במונגו" value={form.safeCollectionName || ""} error={errors.safeCollectionName} onChange={(value) => setForm((p) => ({ ...p, safeCollectionName: value }))} placeholder={GENERATED_SAFE_COLLECTION_LABEL} helper="אופציונלי. אם ריק, Builder backend ייצור שם בטוח ו־HUB יאמת אותו." helpKey="create.safeCollectionName" />
            <Field label="סביבת Mongo" value={form.mongoEnvironment || ""} onChange={(value) => setForm((p) => ({ ...p, mongoEnvironment: value }))} helper="אופציונלי לתיעוד וחיבורי backend. בדרך כלל נקבע בצד השרת." helpKey="create.mongoEnvironment" />
            <Field label="מסד נתונים Mongo" value={form.mongoDatabase || ""} onChange={(value) => setForm((p) => ({ ...p, mongoDatabase: value }))} helper="אופציונלי לתיעוד. לרוב אין צורך שהבעלים ימלא אותו." helpKey="create.mongoDatabase" />
          </>
        ) : (
          <label className="block text-sm">
            <span className="field-label"><HelpLabel helpKey="create.widgetsMapping">מיקום widgets_data.txt</HelpLabel></span>
            <select className="control" value={form.widgetsDbTarget || "users"} onChange={(e) => setForm((p) => ({ ...p, widgetsDbTarget: e.target.value as "users" | "site" }))}>
              <option value="users">siteUsersDb</option>
              <option value="site">siteDB/siteAssets</option>
            </select>
            <span className="mt-1 block text-xs muted">רלוונטי רק למסלול TXT legacy.</span>
          </label>
        )}
        <label className="block text-sm">
          <span className="field-label"><HelpLabel helpKey="create.sharePointConnector">מחבר SharePoint</HelpLabel></span>
          <select className="control" value={createMode ? "browser-sharepoint" : "read-only"} disabled>
            <option value="read-only">קריאה בלבד</option>
            <option value="browser-sharepoint">Browser SharePoint</option>
          </select>
          <span className="mt-1 block text-xs muted">{form.storageBackend === "mongo" ? "אתר Mongo עדיין משתמש ב־SharePoint לאירוח קבצי האתר." : "אתר TXT משתמש ב־SharePoint גם לאירוח וגם לקבצי הנתונים."}</span>
        </label>
      </div>
    </details>
  );

  const renderBuilderBackendSelector = () => {
    const options = builderBackendOptions;
    const selected = selectedBuilderBackendOption;
    const singleOption = options.length === 1 ? options[0] : null;
    const credentialConfigured = selected?.credentialConfigured ?? singleOption?.credentialConfigured ?? false;
    const credentialRef = selected?.credentialRef || singleOption?.credentialRef || builderBackendConfig?.defaultBuilderApiKeyRef || "";
    const selectedHost = displayBackendHost(selected?.backendApiUrl || singleOption?.backendApiUrl || form.backendApiUrl);

    return (
      <div className="space-y-2 text-sm">
        <label className="block">
          <span className="field-label"><HelpLabel helpKey="create.backendApiUrl">Backend של Site Builder</HelpLabel></span>
          {options.length > 1 ? (
            <select className="control" value={form.backendApiUrl || ""} onChange={(event) => applyBuilderBackendOption(event.target.value)} aria-invalid={Boolean(errors.backendApiUrl)}>
              <option value="">בחרו Backend מוגדר</option>
              {options.map((option) => (
                <option key={option.backendApiUrl} value={option.backendApiUrl}>
                  {option.label} - {option.backendApiUrlHost || displayBackendHost(option.backendApiUrl)}
                </option>
              ))}
            </select>
          ) : (
            <input className="control" value={singleOption ? `${singleOption.label} - ${singleOption.backendApiUrlHost}` : ""} placeholder="נבחר אוטומטית מהגדרות ה־HUB" readOnly disabled={Boolean(singleOption)} aria-invalid={Boolean(errors.backendApiUrl)} />
          )}
        </label>
        <p className="text-xs muted">השרת שמולו אתר ה־Site Builder עובד כדי לקרוא ולשמור נתונים ב־Mongo. בסביבה הסודית הערך הזה מגיע מהגדרות ה־HUB ולא צריך להזין אותו ידנית.</p>
        {options.length ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-xs" style={{ color: "var(--success)" }}>נבחר אוטומטית לפי סביבת ה־HUB.</p>
            <div className="mt-2 grid gap-1 text-xs md:grid-cols-2">
              <LinkRow label="Backend host" value={selectedHost} />
              <LinkRow label="Label" value={selected?.label || singleOption?.label || "-"} />
              <LinkRow label="Credential ref" value={credentialRef || "-"} />
              <LinkRow label="Credential" value={credentialConfigured ? "API key מוגדר" : "חסרה הפניה להרשאת API"} />
              <LinkRow label="Allowlist" value={(selected || singleOption)?.allowed === false ? "חסום" : "מאושר"} />
              <LinkRow label="Runtime config" value={form.backendApiUrl ? "ייכתב ל־runtime config" : "טרם נבחר"} />
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            לא מוגדר Backend של Site Builder לסביבה הזאת. יש להגדיר SITE_BUILDER_DEFAULT_BACKEND_API_URL או לבחור Backend מתוך ההגדרות.
          </div>
        )}
        {productionLocalhostBlocked ? (
          <p className="text-xs" style={{ color: "var(--danger)" }}>לא ניתן להשתמש ב־localhost עבור אתר production/classified.</p>
        ) : null}
        {errors.backendApiUrl ? <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.backendApiUrl}</p> : null}
      </div>
    );
  };

  const renderConnectionFields = (createMode = false) => {
    const showTxtLibraryFields = createMode && form.storageBackend === "txt";

    return (
      <div className="space-y-5">
        <section className="soft-panel p-4">
          <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>{createMode ? form.storageBackend === "mongo" ? "יעד SharePoint ו־Mongo backend" : "יעד SharePoint וקבצי TXT" : "חיבור SharePoint"}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={createMode ? "כתובת אתר SharePoint" : "כתובת אתר SharePoint קיים"} value={form.sharePointSiteUrl} error={errors.sharePointSiteUrl} onChange={(value) => setForm((p) => ({ ...p, sharePointSiteUrl: value }))} placeholder="https://portal.army.idf/sites/alphateam" helper={form.storageBackend === "mongo" ? "SharePoint מארח את קבצי האתר. הנתונים החיים יישמרו ב־Mongo דרך Builder backend." : "SharePoint מארח את קבצי האתר ואת קבצי ה־TXT של הנתונים."} helpKey="create.sharePointSiteUrl" />
            {form.storageBackend === "mongo" ? (
              renderBuilderBackendSelector()
            ) : (
              <Field label="קישור סופי לאתר" value={form.finalAppUrl || resolvedPreview?.finalAppUrl || ""} error={errors.finalAppUrl} onChange={(value) => setForm((p) => ({ ...p, finalAppUrl: value }))} helper="הכתובת שממנה המשתמשים פותחים את האתר לאחר הפריסה." helpKey="create.finalAppUrl" />
            )}
            {showTxtLibraryFields ? (
              <>
                <Field label="ספריית siteDB" value={form.siteDbLibrary} onChange={(value) => setForm((p) => ({ ...p, siteDbLibrary: value }))} helper="ספריית SharePoint שבה ייווצרו dist וקבצי האתר. ברירת מחדל: siteDB." helpKey="create.siteDbLibrary" />
                <Field label="ספריית siteUsersDb" value={form.usersDbLibrary} onChange={(value) => setForm((p) => ({ ...p, usersDbLibrary: value }))} helper="ספריית SharePoint לקבצי משתמשים והרשאות. ברירת מחדל: siteUsersDb." helpKey="create.usersDbLibrary" />
              </>
            ) : null}
          </div>
        </section>

        {renderGeneratedDefaultsPreview()}
        {renderAdvancedInfrastructureFields(createMode)}

      {resolvedPreview ? (
        <section className="soft-panel p-4">
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--text-strong)" }}>נתיבי תאימות שייגזרו אוטומטית</h3>
          <div className="grid gap-x-5 md:grid-cols-2">
            {form.storageBackend === "mongo" ? (
              <>
                <LinkRow label="Runtime config URL" value={form.runtimeConfigUrl || resolvedPreview.runtimeConfigUrl} isUrl />
                <LinkRow label="dist" value={resolvedPreview.finalDistRoot} />
                <LinkRow label="final app" value={resolvedPreview.finalAppUrl} isUrl />
                <LinkRow label="Bootstrap setup URL" value={resolvedPreview.bootstrapUrl} isUrl />
              </>
            ) : (
              <>
                <LinkRow label="master config" value={resolvedPreview.txtFiles.masterConfig} />
                <LinkRow label="users_data.txt" value={resolvedPreview.txtFiles.users} />
                <LinkRow label="widgets_data.txt" value={resolvedPreview.txtFiles.widgets} />
                <LinkRow label="gantt_data.txt" value={resolvedPreview.txtFiles.gantt} />
                <LinkRow label="Bootstrap setup URL" value={resolvedPreview.bootstrapUrl} isUrl />
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
    );
  };

  const renderOwners = () => (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>בעל האתר</h3>
        <div className="grid gap-3">
          <Field label="שם בעל האתר" value={form.ownerName} onChange={(value) => setForm((p) => ({ ...p, ownerName: value }))} helpKey="create.ownerName" />
          <Field label="מספר אישי" value={form.ownerPersonalNumber} error={errors.ownerPersonalNumber} onChange={(value) => setForm((p) => ({ ...p, ownerPersonalNumber: value }))} helper="נדרש כדי ליצור משתמש מנהל ראשוני ולאפשר זיהוי בעלים." helpKey="create.ownerPersonalNumber" />
          <Field label="מייל בעל האתר" value={form.ownerEmail} error={errors.ownerEmail} onChange={(value) => setForm((p) => ({ ...p, ownerEmail: value }))} onBlur={completeOwnerEmail} placeholder="s8856096@army.idf.il" helper={`משמש כ־Owner בבקשת יצירת אתר SharePoint וכזהות ראשונית במנהלים. אפשר להקליד רק מספר אישי כמו s8856096, והמערכת תשלים ל־s8856096@army.idf.il.${emailCompletionNotice ? ` ${emailCompletionNotice}` : ""}`} helpKey="create.ownerEmail" />
          <Field label="טלפון" value={form.ownerPhone} onChange={(value) => setForm((p) => ({ ...p, ownerPhone: value }))} helpKey="create.ownerPhone" />
        </div>
      </section>

      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מנהלים ראשוניים</h3>
        <label className="block text-sm">
          <span className="field-label"><HelpLabel helpKey="create.initialAdmins">רשימת מנהלים</HelpLabel></span>
          <textarea
            className="control min-h-40"
            value={initialAdminsText}
            onChange={(e) => setInitialAdminsText(e.target.value)}
            onBlur={completeInitialAdminEmails}
            placeholder="שם | מספר אישי | מייל"
          />
          <span className="mt-1 block text-xs muted">שורה לכל מנהל. אפשר להקליד רק מספר אישי כמו s8856096, והמערכת תשלים ל־s8856096@army.idf.il. בעל האתר יתווסף גם ל־users_data.txt ול־seed docs בזמן ההקמה.</span>
          {emailCompletionNotice ? <span className="mt-1 block text-xs" style={{ color: "var(--success)" }}>{emailCompletionNotice}</span> : null}
          {errors.initialAdmins ? <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>{errors.initialAdmins}</span> : null}
        </label>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="badge badge-neutral">{parsedInitialAdmins.length} מנהלים מהרשימה</span>
          {form.ownerPersonalNumber ? <span className="badge badge-info">בעל אתר: {form.ownerPersonalNumber}</span> : null}
        </div>
      </section>
    </div>
  );

  const renderTrackDetection = () => {
    const runtime = form.runtimeConfigStatus || site?.runtimeConfigStatus;
    const detectedPaths = [
      { label: "siteDB", value: resolvedPreview?.siteDbRoot, status: resolvedPreview ? "זוהה אוטומטית" : "לא זוהה" },
      { label: "siteUsersDb", value: resolvedPreview?.usersDbRoot, status: resolvedPreview ? "זוהה אוטומטית" : "לא זוהה" },
      { label: "siteAssets", value: resolvedPreview?.siteAssetsRoot, status: resolvedPreview ? "זוהה אוטומטית" : "לא זוהה" },
      { label: "dist", value: resolvedPreview?.finalDistRoot, status: resolvedPreview ? "זוהה אוטומטית" : "לא זוהה" },
      { label: "index.html", value: resolvedPreview?.finalAppUrl, status: resolvedPreview ? "נדרש אימות" : "לא זוהה" },
      { label: "runtime config", value: form.runtimeConfigPath || runtime?.path || resolvedPreview?.runtimeConfigPath, status: runtime?.readStatus === "configured" ? "המערכת זיהתה runtime config קיים" : resolvedPreview ? "נדרש אימות" : "לא זוהה" },
      { label: "bootstrap", value: resolvedPreview?.bootstrapRoot, status: resolvedPreview ? "זוהה אוטומטית" : "לא זוהה" },
      { label: "TXT legacy users", value: resolvedPreview?.txtFiles.users, status: resolvedPreview ? "נדרש אימות" : "לא זוהה" }
    ];
    const missing = [
      !form.sharePointSiteUrl ? "כתובת SharePoint אם לא זוהתה אוטומטית" : "",
      form.storageBackend === "mongo" && !form.backendApiUrl ? "Backend של Site Builder מתוך runtime config או הגדרות HUB" : "",
      form.storageBackend === "mongo" && !form.builderSiteId && !form.mongoSiteId ? "Builder siteId / Mongo siteId" : "",
      !runtime ? "runtime config קיים עדיין לא נקרא מהאתר" : ""
    ].filter(Boolean);

    return (
      <div className="space-y-5">
        <section className="soft-panel p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>זיהוי אוטומטי</h3>
              <p className="mt-1 text-xs muted">המערכת מציעה ערך לפי כתובת SharePoint וקוראת ערכים שכבר קיימים ב־runtime config אם הם זמינים ב־HUB.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary" type="button" onClick={applyDetectedDefaults}>השתמש בערך המוצע</button>
              <button className="btn btn-secondary" type="button" onClick={applyDetectedDefaults}>חשב מחדש לפי כתובת SharePoint</button>
              <button className="btn btn-secondary" type="button" onClick={applyRuntimeConfigStatus}>קרא מתוך runtime config</button>
              <button className="btn btn-secondary" type="button" onClick={applyDetectedDefaults}>זהה מחדש</button>
            </div>
          </div>
          {detectionNotice ? <p className="badge badge-info px-3 py-2">{detectionNotice}</p> : null}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <LinkRow label="סוג אחסון משוער" value={runtime?.storageBackend || form.storageBackend || "לא ידוע"} description={runtime?.storageBackend ? "זוהה אוטומטית מתוך runtime config" : "ניתן לעריכה בהגדרות מתקדמות"} />
            <LinkRow label="Backend" value={runtime?.backendApiUrlHost || displayBackendHost(form.backendApiUrl || selectedBuilderBackendOption?.backendApiUrl)} description={form.storageBackend === "mongo" ? "נדרש אימות" : "לא נדרש לאתר TXT"} />
            <LinkRow label="Builder siteId" value={runtime?.builderSiteId || form.builderSiteId || form.mongoSiteId || form.siteCode || "-"} description="המערכת מציעה ערך לפי קוד האתר אם לא נמצא runtime config" />
            <LinkRow label="API key" value={runtime?.apiKeyStatus === "configured" ? "API key מוגדר" : "חסרה הפניה להרשאת API"} description="הערך עצמו לא מוצג ולא נשמר במסך" />
          </div>
        </section>

        <section className="soft-panel p-4">
          <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>נתיבים שזוהו</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {detectedPaths.map((item) => (
              <LinkRow key={item.label} label={item.label} value={item.value || "-"} description={item.status} isUrl={item.label === "index.html"} />
            ))}
          </div>
        </section>

        <section className="soft-panel p-4">
          <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>נתונים חסרים</h3>
          {missing.length ? (
            <div className="space-y-2 text-sm">
              {missing.map((item) => <p key={item} className="badge badge-warning px-3 py-2">{item}</p>)}
            </div>
          ) : (
            <p className="text-sm muted">לא חסרים ערכי בסיס. אימות חי ירוץ בבדיקת קריאה בלבד אחרי שמירה.</p>
          )}
        </section>

        {renderAdvancedInfrastructureFields(false)}
      </div>
    );
  };

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

  const renderCreatePlan = () => {
    const isMongo = form.storageBackend === "mongo";
    const selectedCompatibility = selectedInitialDeployRelease ? getReleaseArtifactCompatibility(selectedInitialDeployRelease) : null;
    const targetCompatible = selectedCompatibility?.storageCompatibility.includes(initialDeployStorage);
    const releaseTargetLabel = initialDeployMode === "skip"
      ? "דילוג מכוון - האתר יישאר partially-created"
      : selectedInitialDeployRelease
        ? releaseOptionLabel(selectedInitialDeployRelease, selectedCompatibility?.artifactKind || "סוג Artifact לא ידוע")
        : initialDeployStorage === "mongo"
          ? "אין Release מתאים לאתר Mongo"
          : "אין Release מתאים לאתר TXT legacy";

    return (
    <div className="space-y-5">
      <section className="soft-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>תוכנית לפני ביצוע</h3>
          <span className={`badge ${creationPlanReady ? "badge-success" : "badge-danger"}`}>{creationPlanReady ? "מוכן לתכנון" : "יש חסמים"}</span>
        </div>
        {form.storageBackend === "mongo" ? (
          <div className="mongo-plan-action mt-3">
            <div className="mongo-plan-action-main">
              <div>
                <p className="field-label">בדיקה אינטראקטיבית</p>
                <h4>תוכנית Mongo לפני ביצוע</h4>
                <p>הכפתור יוצר תוכנית אמיתית מול ה־Builder backend ומציג כאן מיד אם Mongo registry נוצר, אם safeCollectionName תקין ואם יש חסמים. שום דבר לא רץ בפועל עד שמירת האשף בסוף.</p>
              </div>
              <button className="btn btn-primary" type="button" disabled={planning} onClick={() => void generateMongoPlan()}>
                {planning ? "יוצר תוכנית..." : mongoPlan ? "צור מחדש תוכנית Mongo" : "צור תוכנית Mongo"}
              </button>
            </div>
            <div className={`mongo-plan-action-result ${mongoPlan?.blockers.length ? "mongo-plan-action-result-blocked" : mongoPlan ? "mongo-plan-action-result-ready" : ""}`}>
              {planning ? (
                <p className="text-sm muted">יוצר תוכנית ומחשב חסמים...</p>
              ) : mongoPlan ? (
                <>
                  <span className={`badge ${mongoPlan.blockers.length ? "badge-danger" : "badge-success"}`}>{mongoPlan.blockers.length ? "יש חסמים" : "מוכן לביצוע מבוקר"}</span>
                  <div className="mongo-plan-action-metrics">
                    <span><strong>{mongoPlan.steps.length}</strong> צעדים</span>
                    <span><strong>{mongoPlan.seedDocs.length}</strong> מסמכי seed</span>
                    <span><strong>{mongoPlan.blockers.length}</strong> חסמים</span>
                  </div>
                  <p className="text-sm muted">הפירוט המלא מופיע מיד בהמשך המסך תחת “תוכנית Mongo חדשה”.</p>
                </>
              ) : (
                <p className="text-sm muted">עדיין לא נוצרה תוכנית. לחצו כדי לראות חסמים, יעדים ופעולות לפני שממשיכים.</p>
              )}
            </div>
            {planError ? <p className="text-sm" style={{ color: "var(--danger)" }}>{planError}</p> : null}
          </div>
        ) : (
          <div className="mt-3 space-y-2 text-sm muted">
            <p>מסלול TXT יוצר ספריות SharePoint וקבצי נתונים ראשוניים בלבד. אין צורך ב־Backend, API key או registry.</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="badge badge-success">קבצי TXT ראשוניים</span>
              <span className="badge badge-info">SharePoint hosting</span>
              <span className="badge badge-warning">פריסה רק אחרי יצירת תיקיות</span>
            </div>
          </div>
        )}
        <div className="mt-4">
          <h4 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>מה המערכת הולכת ליצור</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="creation-preview-card">
              <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>{isMongo ? "אירוח SharePoint" : "ספריות SharePoint"}</p>
              <ul className="mt-2 space-y-1 text-sm muted">
                {isMongo ? (
                  <>
                    <li>תיקיית dist לאירוח קבצי האתר ו־index.html.</li>
                    <li>קובץ runtime config בתוך dist שמכוון את האתר ל־Builder backend.</li>
                    <li>קישור סופי לאתר שייבדק אחרי פריסה.</li>
                  </>
                ) : (
                  <>
                    <li>ספריית siteDB לאירוח קבצי האתר.</li>
                    <li>ספריית siteUsersDb לקבצי משתמשים והרשאות.</li>
                    <li>תיקיית dist וקישור סופי לאתר שייבדק אחרי פריסה.</li>
                  </>
                )}
              </ul>
            </div>
            <div className="creation-preview-card">
              <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>{isMongo ? "Builder backend" : "קבצי TXT"}</p>
              <ul className="mt-2 space-y-1 text-sm muted">
                {isMongo ? (
                  <>
                    <li>רשומת אתר ב־Builder backend לפי siteId.</li>
                    <li>safeCollectionName שייווצר אוטומטית או יאומת אם הוזן ידנית.</li>
                    <li>Seed docs ראשוניים למנהלים ונתוני בסיס.</li>
                    <li>יכולת backup דרך Builder backend.</li>
                  </>
                ) : (
                  <>
                    <li>users_data.txt עם בעל האתר והמנהלים הראשוניים.</li>
                    <li>bihs_master_config_v1.txt וקבצי נתונים ראשוניים.</li>
                    <li>אין חיבור ל־Builder backend ואין registry.</li>
                  </>
                )}
              </ul>
            </div>
            <div className="creation-preview-card">
              <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>פריסה ראשונית</p>
              <ul className="mt-2 space-y-1 text-sm muted">
                <li>קודם יש ליצור את תשתית SharePoint של האתר.</li>
                <li>לא ניתן לפרוס לפני שנוצרו siteDB / siteUsersDb / dist.</li>
                <li>השלב הבא: יצירת ספריות ותיקיות SharePoint.</li>
                <li>Release נבחר: {releaseTargetLabel}</li>
                <li>תיקיות נדרשות ייווצרו לפני העלאה.</li>
                {isMongo ? <li>runtime config נשמר ולא יידרס.</li> : null}
                <li>האתר יישאר partially-created עד שיש dist/index.html מאומת.</li>
              </ul>
            </div>
            <div className="creation-preview-card">
              <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>לא אוטומטי</p>
              <ul className="mt-2 space-y-1 text-sm muted">
                <li>יצירת Site Collection עצמו אם SharePoint דורש תהליך ידני או הרשאת שירות.</li>
                <li>פעולות SharePoint רצות דרך דפדפן מחובר כשאפשר; הרשאת שירות נדרשת רק אם הדפדפן לא יכול ליצור ספריות.</li>
                <li>{isMongo ? "Ready מלא מחייב אירוח SharePoint, תוכנית Mongo, runtime config ו־deploy תקינים." : "Ready מלא מחייב ספריות SharePoint, קבצי TXT ראשוניים ו־deploy תקין."}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {form.storageBackend === "mongo" && mongoPlan ? (
        <section className="soft-panel p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>תוכנית Mongo חדשה</h3>
            <span className={`badge ${mongoPlan.blockers.length ? "badge-danger" : "badge-success"}`}>{mongoPlan.blockers.length ? "יש חסמים" : "מוכן לביצוע מבוקר"}</span>
            <span className="badge badge-info">Owner mode: אין pending approval jobs</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <LinkRow label="מזהה אתר במערכת Site Builder" value={mongoPlan.identity.builderSiteId} />
            <LinkRow label="SharePoint site" value={mongoPlan.sharePointHosting.sharePointSiteUrl} isUrl />
            <LinkRow label="siteDB target" value={mongoPlan.sharePointHosting.siteDbTarget} />
            <LinkRow label="siteUsersDb target" value={mongoPlan.sharePointHosting.siteUsersDbTarget} />
            <LinkRow label="נתיב runtime config" value={mongoPlan.runtimeConfig.path} />
            <LinkRow label="Builder backend label" value={mongoPlan.builderBackend.label || selectedBuilderBackendOption?.label || "-"} />
            <LinkRow label="שרת Backend" value={mongoPlan.builderBackend.backendApiUrlHost || "-"} />
            <LinkRow label="Credential ref" value={mongoPlan.builderBackend.credentialRef || "-"} />
            <LinkRow label="הרשאת API" value={mongoPlan.builderBackend.credentialConfigured ? "API key מוגדר" : "חסרה הפניה להרשאת API"} />
            <LinkRow label="Allowlist" value={mongoPlan.builderBackend.backendUrlAllowed ? "מאושר" : "חסום"} />
            <LinkRow label="Runtime config" value={mongoPlan.builderBackend.backendWillBeWrittenToRuntimeConfig ? "ייכתב ל־runtime config" : "לא ייכתב"} />
            <LinkRow label="siteDB/siteUsersDb" value={mongoPlan.sharePointHosting.siteDbUsersDbSameTarget ? "אותו יעד פיזי" : "יעדים נפרדים"} />
            <LinkRow label="שם Collection במונגו" value={mongoPlan.builderBackend.safeCollectionNameStrategy === "generated-by-builder-backend" ? GENERATED_SAFE_COLLECTION_LABEL : mongoPlan.builderBackend.expectedSafeCollectionName} />
            <LinkRow label="מסמכי seed" value={`${mongoPlan.seedDocs.length}`} />
          </div>
          {mongoPlan.blockers.length ? (
            <div className="mt-3 rounded-md border border-[var(--danger)] p-3 text-sm" style={{ color: "var(--danger)" }}>
              {mongoPlan.blockers.map((blocker) => <p key={blocker}>{humanizeMongoCreateBlocker(blocker)}</p>)}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {mongoPlan.steps.map((step) => (
              <div key={step.key} className="rounded-md border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${step.status === "blocked" ? "badge-danger" : step.executionClass === "browser-sharepoint" ? "badge-info" : step.executionClass === "mongo-backend" ? "badge-success" : "badge-neutral"}`}>{humanizeMongoCreateExecutionClass(step.executionClass)}</span>
                  <span className="font-bold" style={{ color: "var(--text-strong)" }}>{humanizeMongoCreateStepLabel(step.key, step.label)}</span>
                </div>
                <p className="mt-1 truncate muted" title={step.target}>{step.target}</p>
                {step.blocker ? <p className="mt-1" style={{ color: "var(--danger)" }}>{humanizeMongoCreateBlocker(step.blocker)}</p> : null}
                {step.warning ? <p className="mt-1 muted">{step.warning}</p> : null}
              </div>
            ))}
          </div>
          {mongoPlan.warnings.length ? <p className="mt-3 text-sm muted">{mongoPlan.warnings.join(" · ")}</p> : null}
          <details className="technical-details advanced-details">
            <summary>פרטים טכניים</summary>
            <p className="mt-2 text-xs muted">JSON לתיעוד ול־Audit, לא נדרש להחלטה רגילה.</p>
            <pre className="mt-3 overflow-auto rounded-md p-3 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text)" }}>
              {JSON.stringify({
                identity: mongoPlan.identity,
                runtimeConfig: {
                  path: mongoPlan.runtimeConfig.path,
                  url: mongoPlan.runtimeConfig.url,
                  storageBackend: "mongo",
                  backendApiUrlHost: mongoPlan.runtimeConfig.backendApiUrlHost,
                  siteId: mongoPlan.identity.builderSiteId,
                  apiKeyStatus: mongoPlan.runtimeConfig.apiKeyStatus
                },
                sharePointHosting: mongoPlan.sharePointHosting,
                builderBackend: {
                  backendApiUrlHost: mongoPlan.builderBackend.backendApiUrlHost,
                  label: mongoPlan.builderBackend.label,
                  environment: mongoPlan.builderBackend.environment,
                  credentialRef: mongoPlan.builderBackend.credentialRef,
                  credentialConfigured: mongoPlan.builderBackend.credentialConfigured,
                  backendUrlAllowed: mongoPlan.builderBackend.backendUrlAllowed,
                  backendWillBeWrittenToRuntimeConfig: mongoPlan.builderBackend.backendWillBeWrittenToRuntimeConfig,
                  safeCollectionNameStrategy: mongoPlan.builderBackend.safeCollectionNameStrategy
                },
                summary: mongoPlan.summary
              }, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}

      <section className="soft-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>פריסה ראשונית</h3>
          <span className={`badge ${initialDeployMode === "skip" ? "badge-warning" : selectedInitialDeployRelease ? "badge-success" : "badge-danger"}`}>
            {initialDeployMode === "skip" ? "דילוג מכוון" : selectedInitialDeployRelease ? "Release נבחר" : "חסר Release מתאים"}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <LinkRow label="Release נבחר" value={releaseTargetLabel} />
          <LinkRow label="Artifact תקין" value={selectedInitialDeployRelease?.artifactValidation?.readyForDeploy ? "כן" : initialDeployMode === "skip" ? "דולג" : "לא"} />
          <LinkRow label={isMongo ? "תואם למסלול Mongo" : "תואם למסלול TXT"} value={targetCompatible ? "כן" : selectedCompatibility ? "לא" : "-"} />
          {isMongo ? <LinkRow label="לא ידרוס runtime config" value={selectedCompatibility?.preservesRuntimeConfig === false ? "חסום" : "כן"} /> : null}
          <LinkRow label="תיקיות נדרשות ייווצרו לפני העלאה" value={selectedCompatibility?.requiredFolders?.length ? selectedCompatibility.requiredFolders.join(", ") : "ייגזרו מה־artifact manifest"} />
        </div>
        {initialDeployMode === "skip" ? (
          <p className="mt-3 text-sm" style={{ color: "var(--warning)" }}>האתר נוצר חלקית. עדיין לא בוצעה פריסה ראשונית.</p>
        ) : null}
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
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>{isMongo ? "רכיבי Mongo שייווצרו אם חסרים" : "קבצי TXT שייווצרו אם חסרים"}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {resolvedPreview ? (
            isMongo ? (
              <>
                <LinkRow label="Registry ב־Builder backend" value={form.builderSiteId || form.mongoSiteId || form.siteCode || "-"} />
                <LinkRow label="runtime config" value={form.runtimeConfigPath || resolvedPreview.runtimeConfigPath} />
                <LinkRow label="מסמכי seed" value={mongoPlan ? `${mongoPlan.seedDocs.length}` : "יופיע אחרי יצירת תוכנית Mongo"} />
                <LinkRow label="שם Collection" value={mongoPlan?.builderBackend.expectedSafeCollectionName || form.safeCollectionName || GENERATED_SAFE_COLLECTION_LABEL} />
              </>
            ) : (
              txtFileLabels.map((file) => (
                <LinkRow key={file.key} label={file.label} value={resolvedPreview.txtFiles[file.key]} />
              ))
            )
          ) : <p className="text-sm muted">יש להזין קוד אתר כדי לחשב נתיבים.</p>}
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
  };

  const renderProvision = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="soft-panel p-4">
        <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>רצף יצירה</h3>
        <ol className="space-y-2 text-sm muted">
          <li>1. שמירת רשומת טיוטה ב־HUB.</li>
          {form.storageBackend === "mongo" ? (
            <>
              <li>2. יצירת/אימות siteDB, siteUsersDb, siteAssets ו־dist דרך Browser SharePoint.</li>
              <li>3. קריאה ל־Builder backend ליצירת Mongo registry.</li>
              <li>4. אימות safeCollectionName ויצירת seed docs.</li>
              <li>5. כתיבת runtime config דרך Browser SharePoint.</li>
              <li>6. בחירת Release מתאים והרצת פריסה ראשונית דרך Browser SharePoint.</li>
              <li>7. verification: runtime config + Mongo backend + seed + index.html + backup capability.</li>
              <li>8. האתר מוכן לשימוש רק אחרי שהפריסה הראשונית הסתיימה ואומתה.</li>
            </>
          ) : (
            <>
              <li>2. יצירת/אימות siteDB ו־siteUsersDb דרך Browser SharePoint.</li>
              <li>3. יצירת siteAssets, images, dist ו־dist/assets.</li>
              <li>4. יצירת קבצי TXT ראשוניים במיקומים הפיזיים הנכונים.</li>
              <li>5. בחירת Release מתאים והרצת פריסה ראשונית.</li>
              <li>6. Health check, index.html ורישום evidence.</li>
            </>
          )}
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

  const renderDeploy = () => {
    const selectedCompatibility = selectedInitialDeployRelease ? getReleaseArtifactCompatibility(selectedInitialDeployRelease) : null;
    const compatibleWithMongo = Boolean(selectedCompatibility?.storageCompatibility.includes("mongo"));
    const compatibleWithTxt = Boolean(selectedCompatibility?.storageCompatibility.includes("txt"));
    const targetCompatible = initialDeployStorage === "mongo" ? compatibleWithMongo : compatibleWithTxt;
    const selectedIsUnknown = Boolean(selectedInitialDeployRelease && selectedCompatibility?.storageCompatibility.length === 0);
    const selectedCompatibilityLabel = selectedCompatibility?.storageCompatibility.length
      ? selectedCompatibility.storageCompatibility.join(" + ")
      : selectedInitialDeployRelease
        ? "תאימות לא ידועה"
        : "";
    const selectedReleaseReady = Boolean(selectedInitialDeployRelease && (targetCompatible || selectedIsUnknown));
    const selectedReleaseStatus = !selectedInitialDeployRelease
      ? "לא נבחר Release"
      : targetCompatible
        ? "מתאים למסלול"
        : selectedIsUnknown
          ? "לא מסווג"
          : "לא מתאים";
    const noCompatibleReleaseMessage = initialDeployStorage === "mongo"
      ? "אין Release מתאים לאתר Mongo. צור או סמן Release כתואם Mongo לפני פריסה ראשונית."
      : "אין Release מתאים לאתר TXT legacy.";

    return (
      <div className="space-y-4">
        <section className="soft-panel initial-deploy-card p-4">
          <div className="initial-deploy-header">
            <div>
              <span className="badge badge-info">{initialDeployStorage === "mongo" ? "אתר Mongo חדש" : "אתר TXT legacy"}</span>
              <h3>פריסה ראשונית</h3>
              <p>בחרו איך האתר יקבל את קבצי ה־dist הראשונים. שום פריסה לא תרוץ לפני שתשתית SharePoint מוכנה.</p>
            </div>
            <button className="btn btn-secondary" type="button" disabled={releasesLoading} onClick={() => void onRefreshReleases?.()}>
              <RefreshCw size={15} />רענן Releases
            </button>
          </div>

          <div className="initial-deploy-mode-row">
            <div className="segmented-control initial-deploy-segmented">
              <button className={initialDeployMode === "auto" ? "active" : ""} type="button" onClick={() => setInitialDeployMode("auto")}>בחירה אוטומטית</button>
              <button className={initialDeployMode === "manual" ? "active" : ""} type="button" onClick={() => setInitialDeployMode("manual")}>בחירה ידנית</button>
              <button className={initialDeployMode === "skip" ? "active" : ""} type="button" onClick={() => setInitialDeployMode("skip")}>דלג</button>
            </div>
            <p>
              {initialDeployMode === "auto"
                ? "המערכת בוחרת את ה־Release החדש ביותר שמתאים למסלול האתר."
                : initialDeployMode === "manual"
                  ? "בחרו ידנית Release מהרשימה אחרי בדיקת התאמה."
                  : "האתר יישמר בלי פריסה ראשונית ויישאר במצב חלקי."}
            </p>
          </div>

          {initialDeployMode === "skip" ? (
            <div className="initial-deploy-warning mt-4">
              <p className="font-bold" style={{ color: "var(--warning)" }}>דילוג על פריסה ראשונית ישאיר את האתר במצב חלקי.</p>
              <p className="mt-1 muted">האתר נוצר חלקית. עדיין לא בוצעה פריסה ראשונית.</p>
            </div>
          ) : (
            <div className="initial-release-picker mt-4">
              <label className="block text-sm">
                <span className="initial-release-picker-label">
                  <span className="field-label">Release לפריסה ראשונית</span>
                  <span className={`badge ${selectedReleaseReady ? "badge-success" : selectedIsUnknown ? "badge-warning" : "badge-neutral"}`}>{selectedReleaseStatus}</span>
                </span>
                {initialDeployMode === "auto" ? (
                  <input
                    className="control initial-release-control"
                    value={selectedInitialDeployRelease ? releaseOptionLabel(selectedInitialDeployRelease, selectedCompatibility?.artifactKind || "Artifact מוכן") : ""}
                    readOnly
                    placeholder={releasesLoading ? "טוען Releases..." : noCompatibleReleaseMessage}
                    aria-invalid={Boolean(errors.initialDeploy)}
                  />
                ) : (
                  <select className="control initial-release-control" value={initialDeployReleaseId} onChange={(event) => setInitialDeployReleaseId(event.target.value)} aria-invalid={Boolean(errors.initialDeploy)}>
                    <option value="">{releasesLoading ? "טוען Releases..." : "בחר Release מתאים"}</option>
                    {initialDeployOptions.map((release) => {
                      const compatibility = getReleaseArtifactCompatibility(release);
                      const unknown = compatibility.storageCompatibility.length === 0;
                      return (
                        <option key={release._id} value={release._id}>
                          {releaseOptionLabel(release, unknown ? "תאימות לא ידועה" : compatibility.storageCompatibility.join(" + "))}
                        </option>
                      );
                    })}
                  </select>
                )}
              </label>

              {selectedInitialDeployRelease ? (
                <div className={`initial-release-summary ${selectedReleaseReady ? "initial-release-summary-ready" : "initial-release-summary-blocked"}`}>
                  <div>
                    <p className="initial-release-name">{releaseDisplayLabel(selectedInitialDeployRelease)}</p>
                    <p className="initial-release-meta">
                      גרסה {selectedInitialDeployRelease.version} · {selectedCompatibility?.artifactKind || "Artifact"}{selectedCompatibilityLabel ? ` · ${selectedCompatibilityLabel}` : ""}
                    </p>
                  </div>
                  <span className={`badge ${selectedReleaseReady ? "badge-success" : selectedIsUnknown ? "badge-warning" : "badge-danger"}`}>
                    {selectedReleaseStatus}
                  </span>
                </div>
              ) : (
                <div className="initial-release-empty">
                  <p>{releasesLoading ? "בודק Releases זמינים..." : "לא נמצא Release מתאים לבחירה אוטומטית."}</p>
                  <span>{noCompatibleReleaseMessage}</span>
                </div>
              )}

              {errors.initialDeploy ? <span className="block text-xs" style={{ color: "var(--danger)" }}>{errors.initialDeploy}</span> : null}
            </div>
          )}

          {initialDeployMode !== "skip" ? (
            <details className="initial-deploy-advanced mt-3" open={allowUnknownInitialDeployRelease}>
              <summary>
                <span>אפשרויות מתקדמות</span>
                <small>Release לא מסווג</small>
              </summary>
              <label>
                <input
                  type="checkbox"
                  checked={allowUnknownInitialDeployRelease}
                  onChange={(event) => setAllowUnknownInitialDeployRelease(event.target.checked)}
                />
                <span>
                  <span>אפשר לבחור Release עם תאימות לא ידועה</span>
                  <small>לא ייבחר אוטומטית. השתמשו בזה רק אם בדקתם ידנית שה־Artifact מתאים.</small>
                </span>
              </label>
            </details>
          ) : null}
        </section>

        <section className="soft-panel p-4">
          <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-strong)" }}>תוכנית פריסה ראשונית</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <LinkRow label="Release נבחר" value={selectedInitialDeployRelease ? releaseDisplayLabel(selectedInitialDeployRelease) : initialDeployMode === "skip" ? "דילוג מכוון" : "לא נבחר"} />
            {selectedInitialDeployRelease ? <LinkRow label="מספר גרסה" value={selectedInitialDeployRelease.version} /> : null}
            <LinkRow label="Artifact תקין" value={selectedInitialDeployRelease?.artifactValidation?.readyForDeploy ? "כן" : "לא"} />
            <LinkRow label={initialDeployStorage === "mongo" ? "תואם למסלול Mongo" : "תואם למסלול TXT"} value={targetCompatible ? "כן" : selectedIsUnknown ? "לא ידוע" : "לא"} />
            <LinkRow label="סוג Artifact" value={selectedCompatibility?.artifactKind || "-"} />
            <LinkRow label="מקור תאימות" value={selectedCompatibility?.compatibilitySource || "-"} />
            <LinkRow label="תיקיות נדרשות" value={selectedCompatibility?.requiredFolders?.length ? selectedCompatibility.requiredFolders.join(", ") : "ייגזרו מה־manifest בזמן ביצוע"} />
            {initialDeployStorage === "mongo" ? <LinkRow label="Runtime config ב־Artifact" value={selectedCompatibility?.runtimeConfigFiles?.length ? selectedCompatibility.runtimeConfigFiles.join(", ") : "לא זוהה"} /> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`badge ${selectedInitialDeployRelease ? "badge-success" : initialDeployMode === "skip" ? "badge-warning" : "badge-danger"}`}>Release נבחר</span>
            <span className={`badge ${selectedInitialDeployRelease?.artifactValidation?.readyForDeploy ? "badge-success" : "badge-danger"}`}>Artifact תקין</span>
            <span className={`badge ${targetCompatible || selectedIsUnknown ? "badge-success" : "badge-danger"}`}>
              {initialDeployStorage === "mongo" ? "תואם לאתר Mongo" : "תואם לאתר TXT"}
            </span>
            {initialDeployStorage === "mongo" ? <span className="badge badge-success">לא ידרוס runtime config</span> : null}
            <span className="badge badge-info">תיקיות נדרשות ייווצרו לפני העלאה</span>
            <span className="badge badge-warning">לא ניתן לפרוס לפני שתשתית SharePoint מוכנה</span>
          </div>
          {initialDeployStorage === "mongo" ? (
            selectedCompatibility?.runtimeConfigFiles?.length ? (
              <p className="mt-3 text-sm muted">ה־artifact כולל runtime config. ברירת המחדל היא לשמור את הקובץ שנוצר לאתר ולא לדרוס אותו.</p>
            ) : (
              <p className="mt-3 text-sm muted">runtime config שנוצר לאתר נשמר ולא יידרס.</p>
            )
          ) : null}
          {selectedInitialDeployRelease && initialDeployStorage === "mongo" && !compatibleWithMongo && !selectedIsUnknown ? (
            <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>ה־Release הזה לא תואם לאתר Mongo.</p>
          ) : null}
          {selectedInitialDeployRelease && initialDeployStorage === "txt" && !compatibleWithTxt && !selectedIsUnknown ? (
            <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>ה־Release הזה לא תואם לאתר TXT legacy.</p>
          ) : null}
          {selectedIsUnknown ? (
            <p className="mt-2 text-sm" style={{ color: "var(--warning)" }}>התאימות של ה־Release לא ידועה. זו בחירה מתקדמת ולא תיבחר אוטומטית.</p>
          ) : null}
        </section>
      </div>
    );
  };

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
          {form.storageBackend === "mongo" ? (
            <>
              <li>האתר נרשם ב־HUB, אבל עדיין לא מוכן לפריסה.</li>
              <li>אם קבצי seed חסרים, האתר לא יסומן ready.</li>
              <li>אם אין index.html מאומת אחרי deploy, האתר יישאר partially-created.</li>
              <li>הפריסה הראשונית הסתיימה ואומתה רק אחרי read-back לכל קובץ ו־runtime config אחרי deploy.</li>
            </>
          ) : (
            <>
              <li>אם דולגים על פריסה ראשונית, האתר יישאר partially-created.</li>
              <li>אם אין index.html מאומת אחרי deploy, האתר לא יסומן ready.</li>
              <li>האתר מוכן לשימוש רק אחרי שה־Release המתאים הועלה ואומת.</li>
            </>
          )}
        </ul>
      </section>
    </div>
  );

  const renderChoice = () => (
    <div className="space-y-4 p-5">
      <ModeBoundary
        title="בחרו מה באמת עומד לקרות"
        items={[
          { label: "הוספת אתר קיים", description: "מטא־דאטה בלבד: ה־Hub מתחיל לעקוב. לא נוצרים קבצים, ספריות או הרשאות.", tone: "info" },
          { label: "יצירת אתר חדש", description: "אשף הקמה מלא: תכנון, בעלים, SharePoint, Mongo/TXT, פריסה ראשונית ואימות.", tone: "warning" },
          { label: "פעולות מסוכנות", description: "יופיעו רק אחרי סקירה סופית עם חסמים, scope ומה לא ישתנה.", tone: "success" }
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" className="soft-panel p-5 text-right transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" onClick={() => selectFlow("track-existing")}>
          <FolderCheck className="mb-4 text-[var(--accent)]" size={28} />
          <h3 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>הוסף אתר קיים</h3>
          <p className="mt-2 text-sm muted">האתר כבר קיים. ה־Hub ישמור רשומה ויריץ בדיקות קריאה בלבד. לא תהיה כתיבה ל־SharePoint.</p>
          <span className="btn btn-primary mt-5 inline-flex">המשך להוספת אתר קיים</span>
        </button>
        <button type="button" className="soft-panel p-5 text-right transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" onClick={() => selectFlow("create-new")}>
          <Sparkles className="mb-4 text-[var(--accent)]" size={28} />
          <h3 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>צור אתר חדש</h3>
          <p className="mt-2 text-sm muted">הקמת אתר חדש עם תוכנית, חסמים, פריסה ראשונית ואימות. האתר לא יסומן מוכן לפני שהשערים עוברים.</p>
          <span className="btn btn-primary mt-5 inline-flex">המשך ליצירת אתר חדש</span>
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (flow === "choice") return renderChoice();
    if (flow === "track-existing") {
      if (trackStep === "basic") return renderBasicFields();
      if (trackStep === "connection") return renderConnectionFields(false);
      if (trackStep === "detect") return renderTrackDetection();
      if (trackStep === "validate") return renderTrackValidate();
      return renderTrackSave();
    }

    if (createStep === "storage") return renderStorageChoice();
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
          <div className="max-w-3xl text-xs">
            {saveError ? (
              <span style={{ color: "var(--danger)" }}>{saveError}</span>
            ) : (
              <span className="muted">
                {flow === "create-new"
                  ? "יצירת אתר תרוץ רק אחרי סקירת התוכנית. Owner mode מריץ ישירות ללא תור אישורים."
                  : "הוספת אתר קיים מפעילה בדיקות קריאה בלבד ושומרת metadata ב־HUB."}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={flow === "choice" ? onClose : goBack} type="button">{flow === "choice" ? "ביטול" : activeIndex <= 0 && !site ? "חזרה לבחירה" : "הקודם"}</button>
            {flow !== "choice" && !isLastStep ? (
              <button className="btn btn-primary" onClick={goNext} type="button" disabled={nextDisabled}>הבא</button>
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
