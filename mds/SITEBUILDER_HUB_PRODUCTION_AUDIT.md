# SITEBUILDER_HUB Production Audit

תאריך בדיקה: 2026-05-11  
Workspace: `C:\Users\MeniV\OneDrive - click\Desktop\personal\projects\idf\siteBuilder\sitebuilder-hub`

## 1. Executive summary
### מה קיים עכשיו
- קיים MVP פעיל של `sitebuilder-hub` עם Backend (`Express + Mongoose + Zod`) ו-Frontend (`React + Vite + Tailwind`).
- ה-Hub יודע לנהל Registry של אתרים ב-Mongo, כולל CRUD, ארכוב (`archived`) ו-Manual health check.
- קיימת תצוגת Dashboard ו-Details עם KPI, סינון, מיון, סטטוסים ועריכת Health ידנית.
- בפרויקט המקורי קיימים שירותי SharePoint משמעותיים ל-init/deploy, setup ספריות, permissions setup, backup בפועל, וניהול admins בכמה מקורות (TXT / Site Collection / Owners group).

### מה עובד
- `npm run build` ב-`sitebuilder-hub` עבר בהצלחה מלאה.
- `npm run check` (שממופה ל-build) עבר בהצלחה.
- API response envelope אחיד (`ok/data/meta` ו-`ok/error`).
- CRUD לאתרים ו-Soft delete (archive).
- Derived health status מחושב בצד שרת.

### מה לא קיים עדיין
- אין Authentication/Authorization בכלל ב-Hub.
- אין Jobs engine (queue/worker/retries/progress/audit) ב-Hub.
- אין Version management אמיתי (releases, target version, deploy history, rollback prep).
- אין Backup management במודל נתונים וב-API של Hub.
- אין Admin management per-site במודל וב-API של Hub.
- אין אינטגרציית SharePoint runtime בפועל ב-Hub (ברמת קריאה/כתיבה מבוקרת).

### מוכנות לפרודקשן
- המערכת **לא מוכנה לפרודקשן** כמערכת שליטה מרכזית (Control Center).
- היא מתאימה כ-MVP UI+API לניהול רשומות בסיסי בלבד.

### החוסמים הגדולים ביותר
- היעדר authz/authn.
- היעדר jobs orchestration מרכזי.
- היעדר מודל Version/Backup/Admin היסטורי.
- היעדר audit log מלא ו-traceability לפעולות כתיבה.
- תלות בתהליכי SharePoint שנמצאים כרגע באפליקציה המקורית בצד דפדפן ולא כ-backend controlled operations.

---

## 2. Current project structure
### מיפוי תיקיות עיקריות

| נתיב | מטרה | מצב שימוש נוכחי |
|---|---|---|
| `sitebuilder-hub/server` | API מרכזי ל-Hub (Express/Mongo) | פעיל, בסיסי |
| `sitebuilder-hub/client` | דשבורד ניהולי ל-Hub | פעיל, MVP |
| `sitebuilder-hub/server/src/models` | מודלי Mongoose (`Site`) | חסר מודלים לתחומים קריטיים |
| `sitebuilder-hub/server/src/routes` | ניתוב API (`/api/sites`) | מצומצם |
| `sitebuilder-hub/server/src/scripts/seed.ts` | Seed דמו לאתרים | קיים, נכשל בלי Mongo |
| `sitebuilder-hub/client/src/pages` | `DashboardPage`, `SiteDetailsPage` | קיים |
| `sitebuilder-hub/client/src/components` | UI components, form, table, states | קיים |
| `../src` (הפרויקט המקורי) | אפליקציית Site Builder SharePoint-hosted | רחב ומתקדם פונקציונלית |
| `../scripts/init-sharepoint-site.js` | יצירת/בדיקת מבנה SharePoint לסייט | קיים ומפורט |
| `../deploy.js` | Deployment ל-SharePoint (`robocopy`, clean-first) | קיים |
| `../scripts/postbuild.js` | Orchestration init/deploy/manifest | קיים |
| `../src/services/*admin*` | שירותי ניהול admins (TXT/SiteCollection/Owners) | קיים (במקור, לא ב-Hub) |
| `../src/utils/sharepointUtils.js` | REST helpers, digest, backup, folder/file ops | קיים (במקור, לא ב-Hub) |
| `../src/config/sharepointPaths.js` | בניית נתיבי SharePoint דינמיים | קיים |

---

## 3. Current implemented capabilities

| יכולת | סטטוס | הערות |
|---|---|---|
| Mongo site registry | Implemented | `Site` collection אחת בלבד |
| CRUD sites | Implemented | כולל create/read/update/archive |
| Dashboard UI | Implemented | KPI + filters + table |
| Site details page | Implemented | כולל health/manual update |
| Manual health checks | Implemented | endpoint ייעודי ידני |
| Business status | Implemented | `status` field קיים |
| Derived health status | Implemented | `deriveHealthStatus` בצד שרת |
| Seed data | Implemented | seed idempotent, דורש Mongo פעיל |
| API response shape | Implemented | מעטפת אחידה |
| Validation | Partially implemented | Zod על body/query, ללא טיפול יעודי לכל שגיאת מזהה |
| Logging | Partially implemented | JSON console בלבד, ללא request-id/central sink |
| Admin management | Not implemented (ב-Hub) | קיים רק בפרויקט המקורי |
| SharePoint health checks | Not implemented (ב-Hub) | קיים ידני בלבד במודל |
| Version management | Not implemented | רק שדה `version` פשוט |
| Backup management | Not implemented (ב-Hub) | קיים עשיר בפרויקט המקורי |
| Deploy/update management | Not implemented (ב-Hub) | קיים בפרויקט המקורי כסקריפטים/מסכי admin |
| Jobs queue | Not implemented | אין worker/queue/jobs collection |
| Authentication/authorization | Not implemented | אין guard בכלל |
| Production configuration | Partially implemented | env בסיסי קיים, ללא hardening מלא |

---

## 4. Current backend audit
### Express app structure
- Entry: `server/src/index.ts`.
- App: `server/src/app.ts`.
- Middleware פעילים: `helmet`, `cors`, `express.json`, request logging.
- Routes קיימים: `/api/health`, `/api/sites`.
- 404 handler ו-global error handler קיימים.

### API endpoints קיימים
- `GET /api/health`
- `GET /api/sites`
- `GET /api/sites/:id`
- `POST /api/sites`
- `PATCH /api/sites/:id`
- `DELETE /api/sites/:id` (archive by default, hard-delete עם `?force=true`)
- `POST /api/sites/:id/health-check/manual`

### Mongo models
- מודל יחיד: `Site`.
- `siteCode` מוגדר `unique`.
- תת-סכמה `health` קיימת.

### Validation
- Zod קיים ל-create/update/query/manual-health.
- חסר ולידציה פרמטרית חזקה ל-`:id` (ObjectId) לפני query.

### Error handling
- חלק מה-endpoints עטופים `try/catch`.
- `getSite` ו-`deleteSite` לא עוטפים כל שגיאה של Mongoose cast באופן ייעודי (סיכון ל-500 במקום 400).

### Logging
- Logger פשוט ל-console JSON.
- חסר correlation/request-id.
- חסר log level routing לסינק חיצוני.

### Config / env
- `zod` validation ל-env קיים.
- חסר `server/.env.example` למרות שקיים `server/.env` בפועל.
- `.gitignore` ב-Hub מתעלם רק מ-`.env` ברוט, לא בטוח שמכסה `server/.env` ו-`client/.env`.

### Indexes / constraints
- unique על `siteCode` בלבד.
- אין אינדקסים על שדות פילטור קריטיים (`status`, `updatedAt`, `unitName`, וכד').

### Soft delete behavior
- archive מתבצע באמצעות `status='archived'`.
- רשומות archived עדיין קיימות ומוחזרות ב-list בלי exclusion ברירת מחדל.

### Security basics
- חיובי: `helmet`, `cors` origin מוגדר.
- חסר: auth/authz, rate-limit, input size limits, CSRF strategy (אם cookie-based בעתיד), security headers מתקדמים בהתאם ל-deployment.

### Missing production middleware
- `compression`.
- rate limiter (לכל הפחות לכתיבות).
- request-id middleware.
- structured error mapping לכל שגיאות DB נפוצות.

### CORS handling
- `cors({ origin: env.CLIENT_ORIGIN })` קיים.
- ללא רשימת origins או pattern/env-based allowlist ל-staging/prod multi-origin.

### Readiness / liveness
- קיים endpoint יחיד `/api/health`.
- אין הפרדה בין liveness ו-readiness (ל-Orchestrator/Service monitor).

---

## 5. Current frontend audit
### Routing
- נתיבים: `/` (Dashboard), `/sites/:id` (Details).
- אין Route-level auth guards.

### Dashboard UX
- יש KPI, activity, quick lists, filters, sorting.
- ניווט צד כולל פריטים "בקרוב" (Health/Deploy/Backup/Settings) ללא מימוש.

### Site table
- טבלה עשירה עם פעולות View/Edit/Archive/External links.
- min-width של 1160px יוצר horizontal scroll משמעותי במובייל.

### Site details
- מציג owner/contact/paths/health/activity/notes.
- כולל manual health update.
- אין panels ייעודיים ל-version/backup/admin history.

### Add/Edit forms
- modal רב-שלבי קיים עם ולידציה בסיסית.
- אין ולידציה עסקית למבנה מזהים/מדיניות enterprise מעבר לבסיס.

### Loading / error / empty states
- קיים יישום עקבי לרוב המסכים.

### RTL support
- קיים `dir="rtl"` ברמת shell + עיצוב מותאם.

### Styling consistency
- עקבי, dark-first, שימוש בקומפוננטות reusable.

### Mobile / responsive
- חלקי: cards רספונסיביים טובים, אך table-heavy UX לא מותאם מלא למובייל.

### Accessibility basics
- חסר: aria-label לכפתורי אייקון רבים.
- modal ללא focus trap, ללא Esc close מובנה, ללא focus return.
- אין skip links ואין מדיניות keyboard navigation ברורה.

### מה חסר כדי להיות control center אמיתי
- Global actions (deploy/backup/admin sync).
- Jobs feed בזמן אמת.
- confirmations והרשאות מבוססות role.
- תיעוד audit per action.

---

## 6. Current data model audit
### מצב `Site` כיום
קיימים שדות בסיסיים בלבד: metadata, status, version אחד, counts בסיסיים, health snapshot, timestamps.

### שדות חסרים לניהול גרסאות
- `currentVersion`
- `targetVersion`
- `latestKnownVersion`
- `versionStatus` (`up_to_date/outdated/updating/failed`)
- `lastVersionCheckAt`
- `lastUpgradeAt`
- `upgradeHistory` (או collection נפרד)

### שדות חסרים לניהול גיבויים
- `backupStatus`
- `lastBackupAt`
- `lastBackupId`
- `backupCount`
- `backupStorageMb`
- `backupHistory` (או collection נפרד)

### שדות חסרים לניהול admins
- `adminsCount` קיים אך לא מנוהל אמיתית
- חסרים:
  - `lastAdminSyncAt`
  - `adminSyncStatus`
  - `txtAdmins`
  - `siteCollectionAdmins`
  - `ownersGroupAdmins`
  - `adminDifferences`

### שדות חסרים ל-SharePoint operations
- `documentLibrariesStatus`
- `permissionsStatus`
- `deployStatus`
- `bootstrapUrl`
- paths מלאים עקביים ל-`siteDb/usersDb` כולל host context

### המלצה ארכיטקטונית (להימנע ממודל מונוליטי)
לא לשים הכל ב-`Site`. להשתמש ב-collections נפרדים:
- `Site` (identity + current snapshot)
- `SiteVersionDeployment`
- `SiteBackup`
- `SiteAdminSnapshot`
- `SiteHealthCheck`
- `Job`
- `AuditLog`

---

## 7. Version management design
### מטרות
- Global latest release.
- Auto patch increment (למשל `0.1.19 -> 0.1.20`).
- Deploy לגרסה לכל האתרים / לאתר בודד / רק outdated.
- היסטוריית deployments מלאה + הכנה ל-rollback.

### לוגיקה מוצעת
1. `Release` נוצר עם `version`, `artifactRef`, `notes`, `createdBy`, `createdAt`.
2. בעת יצירה, אם ביקשו auto-next patch:
   - parse semver
   - increment patch
   - validate uniqueness.
3. `VersionStatus` לכל אתר נגזר לפי `currentVersion` מול `latestKnownVersion`/`targetVersion`.
4. Deploy מבוצע רק כ-Job אסינכרוני (לא inline HTTP).
5. תוצאת deploy מתועדת ב-`SiteVersionDeployment` עם log events.

### API endpoints מוצעים
- `GET /api/releases`
- `POST /api/releases`
- `POST /api/releases/:id/deploy-all`
- `POST /api/sites/:id/deploy-version`
- `GET /api/sites/:id/deployments`
- `POST /api/version/next`
- `GET /api/version/status`

### Collections / schemas מוצעים
#### `Release`
- `_id`
- `version` (unique)
- `artifactRef` (path/url/checksum)
- `releaseType` (`patch/minor/major/hotfix`)
- `notes`
- `createdBy`
- `createdAt`

#### `SiteVersionDeployment`
- `_id`
- `siteId`
- `releaseId`
- `fromVersion`
- `toVersion`
- `status` (`queued/running/succeeded/failed/cancelled`)
- `startedAt`, `finishedAt`
- `error`
- `logLines[]`
- `triggeredBy`
- `jobId`

#### `Site` (snapshot additions)
- `currentVersion`
- `targetVersion`
- `latestKnownVersion`
- `versionStatus`
- `lastUpgradeAt`
- `lastVersionCheckAt`

---

## 8. Backup management design
### מטרות
- backup לאתר יחיד / כולם / קבוצה נבחרת.
- היסטוריית backup עם metadata מלא.
- verification flow.
- restore-plan preparation.

### עקרונות
- פעולת backup תמיד דרך Job.
- metadata נשמר ב-Mongo גם אם הקבצים נשמרים ב-SharePoint/Storage.
- verification step עצמאי (hash, existence, file count).

### API endpoints מוצעים
- `GET /api/backups`
- `GET /api/sites/:id/backups`
- `POST /api/sites/:id/backups`
- `POST /api/backups/run-all`
- `GET /api/backups/:id`
- `POST /api/backups/:id/verify`
- `POST /api/backups/:id/restore-plan`

### Collections / schemas מוצעים
#### `SiteBackup`
- `_id`
- `siteId`
- `backupId` (human readable)
- `status` (`queued/running/succeeded/failed/verified/unverified`)
- `storageProvider` (`sharepoint/fileshare/s3/...`)
- `storagePath`
- `sizeBytes`
- `filesCount`
- `createdAt`
- `createdBy`
- `sourcePaths[]`
- `verification` `{ status, checkedAt, checkedBy, details }`
- `jobId`
- `error`

#### `Site` (snapshot additions)
- `backupStatus`
- `lastBackupAt`
- `lastBackupId`
- `backupCount`
- `backupStorageMb`

---

## 9. Admin management per site design
### מטרות
- הצגת admins לכל אתר מכל מקור.
- diff בין TXT / Site Collection / Owners Group.
- sync/add/remove עם audit מלא.
- תמיכה ב-input מספר אישי `s1234567`.

### API endpoints מוצעים
- `GET /api/sites/:id/admins`
- `POST /api/sites/:id/admins/sync`
- `POST /api/sites/:id/admins`
- `DELETE /api/sites/:id/admins/:adminId`
- `GET /api/sites/:id/admins/diff`

### Collections / schemas מוצעים
#### `SiteAdminSnapshot`
- `_id`
- `siteId`
- `capturedAt`
- `capturedBy`
- `txtAdmins[]`
- `siteCollectionAdmins[]`
- `ownersGroupAdmins[]`
- `counts` `{ txt, siteCollection, ownersGroup, union }`
- `diff` `{ missingInTxt[], missingInSiteCollection[], missingInOwnersGroup[] }`
- `syncStatus`
- `syncError`

#### `SiteAdminAction`
- `_id`
- `siteId`
- `action` (`sync/add/remove`)
- `targetSource`
- `adminIdentity` `{ personalNumber, email, loginName, displayName }`
- `status`
- `startedAt`, `finishedAt`
- `error`
- `jobId`
- `triggeredBy`

---

## 10. Jobs and audit log design
### המלצה
להתחיל עם `Mongo jobs collection` פשוט + worker process, ואז לשדרג ל-queue ייעודי בהמשך.

### Job types
- `health-check`
- `deploy`
- `backup`
- `admin-sync`
- `repair`
- `version-upgrade`

### Job schema מוצע (`Job`)
- `_id`
- `type`
- `siteId` (nullable ל-global jobs)
- `payload`
- `status` (`queued/running/succeeded/failed/cancelled/retrying`)
- `progressPercent`
- `attempt`
- `maxAttempts`
- `startedAt`
- `finishedAt`
- `nextRetryAt`
- `error` `{ code, message, details }`
- `logs[]` (או reference ל-JobLog collection)
- `createdBy`
- `createdAt`

### AuditLog schema מוצע
- `_id`
- `actor` `{ userId, name, role }`
- `action`
- `entityType`
- `entityId`
- `before` (optional)
- `after` (optional)
- `result` (`success/failure`)
- `error`
- `requestId`
- `createdAt`

---

## 11. Production readiness checklist

| נושא | סטטוס | הערה אופרטיבית |
|---|---|---|
| env management | Needs work | חסר baseline אחיד לכל שכבות + ignore policy בטוחה לכל `.env` |
| Mongo persistence | Needs work | תלוי Mongo חיצוני; אין health-degraded mode |
| indexes | Needs work | אינדקסים מינימליים בלבד |
| authentication | Missing | אין login/session/JWT בכלל ב-Hub |
| authorization | Missing | אין RBAC/ABAC |
| audit logging | Missing | אין audit trail למסלולי write |
| backups | Missing (ב-Hub) | קיים רק בפרויקט המקורי, לא מרכזי/רב-אתרי |
| error handling | Needs work | חסר מיפוי שגיאות עקבי לכל failure classes |
| health endpoint | Needs work | endpoint יחיד; אין readiness/liveness נפרד |
| deployment procedure | Needs work | Hub ללא pipeline deployment operation |
| server hosting plan | Missing | אין מסמך תפעול פרודקשן ל-Hub |
| Windows/service setup | Missing | אין service wrapper/runbook ל-Node process |
| closed network compatibility | Needs work | יכולות קיימות במקור, לא מאומצות ל-Hub backend |
| SharePoint credentials/session strategy | Missing | אין אסטרטגיית server-side מוגדרת |
| safe read-only mode | Missing | אין mode switch API/UI לפעולות קריאה בלבד |
| write action approvals | Missing | אין approval gates לפעולות מסוכנות |
| rollback strategy | Missing | אין design מלא ל-version rollback |

---

## 12. Recommended implementation roadmap

### Phase 1: Production-ready MVP1 dashboard
- Goal: לייצב Hub כמערכת registry+observability בסיסית לפרודקשן.
- Files likely affected:
  - `sitebuilder-hub/server/src/app.ts`
  - `sitebuilder-hub/server/src/controllers/sites.controller.ts`
  - `sitebuilder-hub/server/src/services/sites.service.ts`
  - `sitebuilder-hub/client/src/pages/DashboardPage.tsx`
  - `sitebuilder-hub/client/src/components/SitesTable.tsx`
- Backend work:
  - שיפור שגיאות/ולידציות/אינדקסים.
  - hardening middleware בסיסי.
- Frontend work:
  - שיפור רספונסיביות table+states.
  - נגישות בסיסית.
- Risks:
  - שינוי response contracts ללא versioning.
- Acceptance criteria:
  - Dashboard יציב, CRUD אמין, שגיאות קריאות, health API עקבי.

### Phase 2: Read-only SharePoint health checks
- Goal: לאסוף health אמיתי מ-SharePoint ללא כתיבה.
- Files likely affected:
  - `sitebuilder-hub/server/src/services/sharepoint/*.ts` (חדש)
  - `sitebuilder-hub/server/src/routes/health.routes.ts` (חדש)
  - `sitebuilder-hub/client/src/pages/SiteDetailsPage.tsx`
- Backend work:
  - adapters לקריאת folders/files/permissions מצב.
- Frontend work:
  - health timeline + confidence indicators.
- Risks:
  - auth/session ל-SharePoint בסביבה סגורה.
- Acceptance criteria:
  - אתר מציג health read-only אמיתי עם timestamp ו-source.

### Phase 3: Jobs system and audit log
- Goal: מנוע פעולות אסינכרוני עם traceability.
- Files likely affected:
  - `server/src/models/Job.ts` (חדש)
  - `server/src/models/AuditLog.ts` (חדש)
  - `server/src/workers/*` (חדש)
  - `client/src/pages/JobsPage.tsx` (חדש)
- Backend work:
  - queue loop/retries/status progression.
- Frontend work:
  - jobs table + logs panel.
- Risks:
  - race conditions ועדכון סטטוס לא עקבי.
- Acceptance criteria:
  - כל פעולה כבדה נוצרת כ-Job ומתועדת end-to-end.

### Phase 4: Version management
- Goal: release registry + deploy orchestration.
- Files likely affected:
  - `server/src/models/Release.ts` (חדש)
  - `server/src/models/SiteVersionDeployment.ts` (חדש)
  - `server/src/routes/releases.routes.ts` (חדש)
  - `client/src/pages/ReleasesPage.tsx` (חדש)
- Backend work:
  - semver next patch, deploy-all/selective/outdated.
- Frontend work:
  - release dashboard + per-site status.
- Risks:
  - artifact provenance וסנכרון גרסאות לא עקבי.
- Acceptance criteria:
  - אפשר ליצור release ולראות פריסות לכל אתר עם היסטוריה.

### Phase 5: Backup management
- Goal: backup orchestration מרכזי + metadata היסטורי.
- Files likely affected:
  - `server/src/models/SiteBackup.ts` (חדש)
  - `server/src/routes/backups.routes.ts` (חדש)
  - `server/src/services/backups.service.ts` (חדש)
  - `client/src/pages/BackupsPage.tsx` (חדש)
- Backend work:
  - run-all/run-site/verify/restore-plan.
- Frontend work:
  - backup list/details/verification UI.
- Risks:
  - נפחי נתונים ועלות I/O.
- Acceptance criteria:
  - backup jobs עובדים עם היסטוריה ומדדי size/files/status.

### Phase 6: Admin management per site
- Goal: unify TXT + Site Collection + Owners Group per-site.
- Files likely affected:
  - `server/src/models/SiteAdminSnapshot.ts` (חדש)
  - `server/src/routes/admins.routes.ts` (חדש)
  - `server/src/services/admin-sync.service.ts` (חדש)
  - `client/src/pages/AdminsPage.tsx` (חדש)
- Backend work:
  - sync engine + diff generation + add/remove APIs.
- Frontend work:
  - diff tables + guided actions + confirmations.
- Risks:
  - false positives בדיפרנסים עקב identity normalization.
- Acceptance criteria:
  - לכל אתר מוצגים admins מכל מקור + diff + sync log.

### Phase 7: Controlled deploy/update automation
- Goal: write-actions מבוקרות ומאושרות לפריסה/עדכון.
- Files likely affected:
  - `server/src/services/deploy.service.ts` (חדש)
  - `server/src/policies/approvals.ts` (חדש)
  - `client/src/pages/DeploymentsPage.tsx` (חדש)
- Backend work:
  - approval workflow + safety rails + rollback hooks.
- Frontend work:
  - approval queue, run preview, result logs.
- Risks:
  - פעולות כתיבה לא מבוקרות ל-SharePoint.
- Acceptance criteria:
  - אין פעולה כותבת בלי אישור, לוג מלא, ויכולת rollback plan.

---

## 13. File-by-file findings
### sitebuilder-hub
- `sitebuilder-hub/package.json` — סקריפטים מרכזיים (`build/check/seed`), `check` זהה ל-build.
- `sitebuilder-hub/README.md` — מגדיר MVP1.1 ומצהיר מפורשות שחסרים jobs/SharePoint provisioning/auth.
- `sitebuilder-hub/.env.example` — משתני בסיס בלבד.
- `sitebuilder-hub/.gitignore` — מתעלם `/.env` בלבד; לא מכסה בהכרח `server/.env` ו-`client/.env`.
- `sitebuilder-hub/server/src/app.ts` — middleware בסיסי + `/api/health` + `/api/sites`.
- `sitebuilder-hub/server/src/config/env.ts` — ולידציית env עם Zod.
- `sitebuilder-hub/server/src/models/Site.ts` — סכימת אתר בסיסית; חסרים מודלי Version/Backup/Admin/Job/Audit.
- `sitebuilder-hub/server/src/validators/site.schema.ts` — ולידציה טובה ל-body/query, חסר schema ל-id params.
- `sitebuilder-hub/server/src/services/sites.service.ts` — CRUD + derived health + stats, ללא business workflows מתקדמים.
- `sitebuilder-hub/server/src/scripts/seed.ts` — seed idempotent (upsert).
- `sitebuilder-hub/client/src/App.tsx` — routing בסיסי בלבד.
- `sitebuilder-hub/client/src/pages/DashboardPage.tsx` — UI עשיר ל-MVP אך ללא פעולות תפעול מרכזיות אמיתיות.
- `sitebuilder-hub/client/src/pages/SiteDetailsPage.tsx` — פרטי אתר + manual health בלבד.
- `sitebuilder-hub/client/src/components/Sidebar.tsx` — יכולות עתידיות מסומנות "בקרוב" (deploy/backup/health/settings).
- `sitebuilder-hub/client/src/components/SiteFormModal.tsx` — טופס יצירה/עריכה טוב אך לא מותאם עדיין למדיניות enterprise מלאה.

### פרויקט Site Builder המקורי (רלוונטי ל-Hub עתידי)
- `siteBuilder/scripts/init-sharepoint-site.js` — init/check/finalize/bootstrap-mode לספריות וקבצי מערכת.
- `siteBuilder/deploy.js` — deploy עם `robocopy`, כולל clean-first ו-dry-run.
- `siteBuilder/scripts/postbuild.js` — orchestration מלא (check-only -> finalize/bootstrap -> deploy).
- `siteBuilder/src/config/sharepointPaths.js` — בניית נתיבי SharePoint דינמיים per site.
- `siteBuilder/src/utils/sharepointUtils.js` — REST primitives, digest cache, folder/file ops, create/list/delete backups, ensureRecentBackup.
- `siteBuilder/src/services/sharePointDocumentLibrariesSetup.ts` — יצירה/ולידציה של document libraries + browser view readiness.
- `siteBuilder/src/services/sharePointPermissionsSetup.ts` — setup הרשאות ל-usersDb marker-based.
- `siteBuilder/src/services/sharePointSiteCollectionAdminsService.ts` — add/remove/list site collection admins + personal number normalization.
- `siteBuilder/src/services/sharePointOwnersGroupService.ts` — list/add/remove users in Associated Owners Group.
- `siteBuilder/src/services/txtAdminsService.ts` — sync TXT admins מול SharePoint admins.
- `siteBuilder/src/components/AdminBackupManagement.jsx` — UI ניהול גיבויים פעיל באפליקציה המקורית.
- `siteBuilder/src/components/AdminSiteOwnersManagement.jsx` — UI ניהול admins מרובה-מקורות.
- `siteBuilder/src/pages/AdminSharePointSetupPage.jsx` — setup דפדפני מפורט ל-init/copy/verify.

---

## 14. Questions / assumptions
1. איפה בדיוק יישמרו backups לטווח ארוך: SharePoint בלבד, File Share, או Object Storage נוסף?
2. האם Hub מורשה לבצע write לכל האתרים או רק read + approval flow?
3. האם שרת ה-Hub ירוץ בתוך הרשת הסגורה עם session/context ל-SharePoint, או מחוץ לה עם service account?
4. מקור אמת לגרסה: build artifact קבוע, git tag, או dist מועלה ידנית?
5. האם update לגרסה יבוצע על ידי העתקת `dist` או pipeline build+deploy מלא לכל אתר?
6. מה מדיניות אישורים לפעולות מסוכנות (`deploy`, `backup delete`, `admin remove`)?
7. האם נדרשת הזדהות משתמשים ל-Hub כבר ב-MVP פרודקשן, ואם כן באיזה IdP?
8. האם נדרש dual-control (שני מאשרים) לפעולות write על אתרי production?
9. האם יש דרישת שמירת לוגים רגולטורית (Retention + tamper resistance)?
10. האם ה-Hub אמור לנהל גם את מסכי admin הקיימים באפליקציה המקורית או להחליף אותם לחלוטין?

---

## Appendix: safe checks executed
- `npm run build` (sitebuilder-hub): passed.
- `npm run check` (sitebuilder-hub): passed.
- `npm run seed` (sitebuilder-hub): failed (`ECONNREFUSED 127.0.0.1:27017`, Mongo not available).
