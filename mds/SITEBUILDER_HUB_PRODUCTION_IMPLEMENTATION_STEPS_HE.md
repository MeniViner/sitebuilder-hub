# תוכנית ייצור מלאה ל-SiteBuilder Hub

מסמך זה מגדיר צעד-אחר-צעד איך להביא את `sitebuilder-hub` למצב Production אמיתי כמערכת ניהול מרכזית לכל אתרי Site Builder על SharePoint.

## 1. מטרה ותוצר סופי

### מטרת על
להפעיל מערכת מרכזית אחת שמספקת:
- שליטה בכל אתרי Site Builder
- ניהול גרסאות ושדרוגים
- ניהול גיבויים והכנה לשחזור
- ניהול Admins לכל אתר
- Jobs מרכזי לכל פעולה תפעולית
- Audit מלא לכל פעולה
- עבודה בטוחה בסביבה סגורה

### Definition of Done (Production)
המערכת נחשבת מוכנה ל-Production רק אם מתקיימים כל התנאים הבאים:
1. יש Authentication + Authorization פעילים ומחייבים.
2. כל פעולה כותבת (deploy/backup/admin sync) עוברת דרך Job + Audit.
3. יש תמיכה מלאה ב-Release lifecycle (יצירה, deploy, סטטוסים, כשלונות).
4. יש גיבוי לכל אתר + verify + היסטוריה ניתנת לחיפוש.
5. יש diff אמין בין מקורות Admins (TXT/SiteCollection/Owners).
6. יש observability מלאה (logs, health, metrics בסיסיים, התרעות).
7. יש תהליך rollout ו-rollback מתועד שנבדק בפועל.

---

## 2. מצב נוכחי (לפי הקוד הקיים)

### קיים
- Backend TypeScript עם Express + Mongoose.
- Frontend React עם דפי Dashboard + Releases + Backups + Admins + Jobs.
- מודלים ראשוניים ל-Site/Release/Backup/AdminSnapshot/Job/AuditLog.
- Worker בסיסי להרצת jobs.
- בדיקות build/check תקינות.

### חסר להשלמה לפרודקשן מלא
- אינטגרציה אמיתית ל-SharePoint runtime (לא רק metadata updates).
- מדיניות אישור פעולות (approvals) לפני write רגיש.
- בקרת הרשאות מפורטת (RBAC מלא + policy per action).
- מערכת התראות ותפעול On-Call.
- CI/CD מוקשח + gates.
- DR/restore drills מבוססי תרחישים אמיתיים.

---

## 3. ארכיטקטורת יעד

## 3.1 רכיבים
1. `sitebuilder-hub-client`
- UI לניהול מרכזי.

2. `sitebuilder-hub-server`
- API control plane.

3. `MongoDB`
- persistence לכל המודלים (Site, Job, Backup וכו').

4. `Jobs Worker`
- תהליך worker ייעודי (אפשר באותו process בשלב ראשון, מומלץ להפריד בהמשך).

5. `SharePoint Adapter Layer`
- שכבת שירותים שמבצעת read/write מול SharePoint בצורה מבוקרת.

6. `Audit & Logs Sink`
- שמירת AuditLog במסד + יצוא לוגים למערכת ניטור ארגונית.

## 3.2 עקרונות חובה
- אין write direct מתוך endpoint סינכרוני: הכל דרך Job.
- כל Job חייב requestId, createdBy, status transitions, logs.
- כל failure צריך להיות traceable עד entity/action.
- שדות snapshot ב-Site נשמרים, אבל היסטוריה נשמרת בקולקציות נפרדות.

---

## 4. שלבי מימוש פרודקשן (Execution Plan)

## Phase 0 - ייצוב בסיס ותשתית

### מטרה
לייצב את הבסיס לפני פיתוח פיצ'רים מתקדמים.

### משימות
1. לקבע versioning פנימי
- להגדיר `APP_VERSION` ב-env.
- לחשוף ב-`/api/health`.

2. להקשיח env
- להוסיף `server/.env.example` מלא.
- להוסיף env validation לכל משתנה חובה.
- להפריד dev/staging/prod profiles.

3. לשפר error model
- קוד שגיאה אחיד לכל domain (`RELEASE_*`, `BACKUP_*`, `ADMIN_*`, `JOB_*`).

4. לשפר id validation
- middleware מרכזי ל-ObjectId params.

5. להקשיח auth בסיסי
- לא לאפשר `AUTH_ENABLED=false` בפרודקשן.
- fail-fast בבוטסטרפ אם פרודקשן ו-auth כבוי.

### Acceptance
- שרת לא עולה בפרודקשן ללא auth.
- כל endpoint מחזיר שגיאה אחידה.
- כל env חסר מזוהה בעלייה.

---

## Phase 1 - RBAC והרשאות פעולה

### מטרה
להחיל policy אמיתית ולא רק role מינימלי.

### משימות
1. להגדיר permission matrix
- `viewer`: read-only.
- `operator`: health/manual/admin non-destructive/backup verify.
- `admin`: deploy-all, release create, rerun jobs, restore-plan, destructive actions.

2. להוסיף policy middleware
- `requirePermission("release:create")` וכו'.

3. לתעד deny events ב-AuditLog
- כל 403 חייב להיות מתועד.

4. להוסיף endpoint לבדיקת permission של המשתמש
- `GET /api/me/permissions`

### Acceptance
- אין endpoint write ללא permission בדוק.
- UI מסתיר פעולות חסומות לפי הרשאות משתמש.

---

## Phase 2 - SharePoint Read-Only Health אמיתי

### מטרה
להחליף Manual health ב-health אמיתי מקריאות SharePoint.

### משימות
1. להקים `server/src/services/sharepoint/*`
- `sharepoint.auth.ts` (session/token strategy).
- `sharepoint.paths.ts` (derive paths per site).
- `sharepoint.health.ts` (בדיקת folders/files/permissions/read endpoints).

2. להגדיר health schema מורחב
- document libraries
- permissions
- dist/index/assets
- txt db files
- lastCheck source

3. ליצור job type `health-check`
- endpoint: `POST /api/sites/:id/health-check/run`
- endpoint bulk: `POST /api/health-check/run-all`

4. לשמור history
- להוסיף `SiteHealthCheck` collection.

### Acceptance
- לכל אתר אפשר להריץ health אמיתי ולקבל evidence ברור.
- Dashboard מציג Last N checks והאם יש regression.

---

## Phase 3 - Version Management מלא

### מטרה
מחזור חיים מלא של releases ופריסות לכל אתר.

### משימות
1. Release lifecycle
- create release עם semver validation.
- auto-increment patch דרך `POST /api/version/next`.

2. Deployment orchestration
- deploy all
- deploy outdated
- deploy selected site

3. Failure handling
- סטטוסים: queued/running/succeeded/failed/cancelled.
- retry policy (maxAttempts + backoff).

4. Deployment history
- `SiteVersionDeployment` כולל logs + timestamps + actor.

5. Rollback preparation
- endpoint: `POST /api/sites/:id/deploy-version` לגרסה ישנה (validated).
- guard: לא לפרוס גרסה שלא קיימת ב-Release.

### Acceptance
- ניתן לראות לכל אתר current/target/latest/versionStatus.
- פריסה כושלת לא מעדכנת currentVersion בטעות.

---

## Phase 4 - Backup Management מלא

### מטרה
גיבוי אמיתי לכל אתר עם metadata ואימות.

### משימות
1. Backup execution דרך SharePoint adapter
- לקרוא source paths
- להעתיק ליעד backup
- לשמור metadata size/files/status

2. Backup scope
- backup site יחיד
- backup all
- backup selected sites

3. Verification flow
- verify ידני/אוטומטי
- checksum/count/exists

4. Restore preparation
- לייצר restore plan מובנה עם prereqs + approvals.

5. Retention policy
- להגדיר מדיניות ניקוי גיבויים ישנים (job ייעודי).

### Acceptance
- ניתן לסנן ולשאול גיבויים לפי site/date/status.
- כל backup כולל createdBy + sourcePaths + verification status.

---

## Phase 5 - Admin Management per Site מלא

### מטרה
ניהול אחוד לכל מקורות המנהלים + diff + sync.

### משימות
1. Identity normalization
- canonical key: loginName > personalNumber > email > displayName.

2. Source adapters
- TXT source adapter
- Site Collection source adapter
- Owners Group source adapter

3. Diff engine
- missingInTxt
- missingInSiteCollection
- missingInOwnersGroup

4. Sync engine
- sync read-only mode (suggestions בלבד)
- sync write mode (דורש הרשאה ואישור)

5. add/remove admin
- פעולות מבוקרות לכל מקור (עם logs).

6. Personal number parser
- תמיכה מלאה ב-`s1234567` + email-derivation לפי policy ארגוני.

### Acceptance
- מסך Admins מציג תמונת מצב אחידה, פערים, ופעולות תיקון.
- כל sync/add/remove מתועד ב-Audit.

---

## Phase 6 - Jobs Engine קשיח

### מטרה
להפוך Job system ל-production grade.

### משימות
1. Worker isolation
- להפריד worker process מה-API process.

2. Concurrency control
- lock per site per job-type למניעת התנגשות.

3. Retry policy
- exponential backoff.
- dead-letter status אחרי max attempts.

4. Progress model
- כל Job יעדכן milestones עם אחוז ברור.

5. Cancelling jobs
- endpoint: `POST /api/jobs/:id/cancel`
- cancellation-safe handlers.

6. Idempotency
- job key אופציונלי למניעת enqueue כפול.

### Acceptance
- jobs לא מתנגשים על אותו אתר באותו domain.
- retry עקבי ומתועד.

---

## Phase 7 - Audit, Compliance, Observability

### מטרה
נראות מלאה, חקירות קלות, ועמידה בדרישות ארגוניות.

### משימות
1. Audit enrichment
- requestId
- actor
- before/after
- result/error
- metadata (siteCode/releaseVersion וכו')

2. Log shipping
- לייצא לוגים למערכת SIEM/ELK/ארגונית.

3. Metrics בסיסיים
- jobs queued/running/failed
- backup success rate
- deploy success rate
- mean duration per job type

4. Alerts
- failed jobs spikes
- backup failures
- deploy failures
- readiness down

5. dashboards
- operational dashboard למפעילים.

### Acceptance
- ניתן לחקור כל פעולה עד רמת שורה וזמן.
- קיימות התרעות אוטומטיות על תקלות קריטיות.

---

## Phase 8 - CI/CD ו-Release Pipeline

### מטרה
אספקה יציבה, ניתנת לשחזור, עם gates ברורים.

### משימות
1. CI
- install
- typecheck
- build
- tests unit
- tests integration (mocked)
- lint

2. Security gates
- dependency audit
- secret scanning
- SAST בסיסי

3. CD
- deploy ל-staging
- smoke tests
- promote ל-production

4. DB migration strategy
- migration scripts versioned.
- rollback scripts.

5. Artifact management
- שמירת builds לפי version.

### Acceptance
- אין deploy לפרודקשן ללא green pipeline.
- כל release traceable ל-commit+artifact.

---

## Phase 9 - Go-Live & Post-Go-Live

### Go-Live checklist
1. הרשאות production users נבדקו.
2. Mongo backups פעילים.
3. Monitoring/alerts פעילים.
4. Rollback playbook אושר.
5. DR contact list זמין.
6. runbook תפעולי לצוות.

### Post-Go-Live (שבוע ראשון)
1. Daily review של failed jobs.
2. בדיקת latency ו-job durations.
3. תיקון edge cases עם hotfix window.

---

## 5. צעדים אופרטיביים לפי קבצים (מפת עבודה)

## 5.1 Backend

### תשתיות
- `server/src/app.ts`
- `server/src/index.ts`
- `server/src/config/env.ts`
- `server/src/middlewares/*`

### מודלים
- `server/src/models/Site.ts`
- `server/src/models/Release.ts`
- `server/src/models/SiteVersionDeployment.ts`
- `server/src/models/SiteBackup.ts`
- `server/src/models/SiteAdminSnapshot.ts`
- `server/src/models/Job.ts`
- `server/src/models/AuditLog.ts`
- (להוסיף) `server/src/models/SiteHealthCheck.ts`

### דומיינים
- `server/src/services/releases.service.ts`
- `server/src/services/backups.service.ts`
- `server/src/services/admins.service.ts`
- `server/src/services/jobs.service.ts`
- `server/src/services/jobs.worker.ts`
- `server/src/services/audit.service.ts`
- (להוסיף) `server/src/services/sharepoint/*`

### API
- `server/src/routes/*.routes.ts`
- `server/src/controllers/*.controller.ts`
- `server/src/validators/*.schema.ts`

## 5.2 Frontend
- `client/src/App.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/api/sitesApi.ts`
- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/pages/ReleasesPage.tsx`
- `client/src/pages/BackupsPage.tsx`
- `client/src/pages/AdminsPage.tsx`
- `client/src/pages/JobsPage.tsx`

---

## 6. אפיון endpoints מלא (יעד)

### Sites
- `GET /api/sites`
- `GET /api/sites/:id`
- `POST /api/sites`
- `PATCH /api/sites/:id`
- `DELETE /api/sites/:id`

### Health
- `GET /api/health/live`
- `GET /api/health/ready`
- `GET /api/health`
- `POST /api/sites/:id/health-check/run`
- `POST /api/health-check/run-all`
- `GET /api/sites/:id/health-checks`

### Version / Releases
- `GET /api/releases`
- `POST /api/releases`
- `POST /api/releases/:id/deploy-all`
- `POST /api/sites/:id/deploy-version`
- `GET /api/sites/:id/deployments`
- `POST /api/version/next`
- `GET /api/version/status`

### Backups
- `GET /api/backups`
- `GET /api/sites/:id/backups`
- `POST /api/sites/:id/backups`
- `POST /api/backups/run-all`
- `GET /api/backups/:id`
- `POST /api/backups/:id/verify`
- `POST /api/backups/:id/restore-plan`

### Admins
- `GET /api/sites/:id/admins`
- `POST /api/sites/:id/admins/sync`
- `POST /api/sites/:id/admins`
- `DELETE /api/sites/:id/admins/:adminId`
- `GET /api/sites/:id/admins/diff`

### Jobs
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/rerun`
- `POST /api/jobs/:id/cancel`

### Audit
- `GET /api/audit`

---

## 7. סביבות, DevOps ופקודות עבודה

## פקודות מקומיות
```bash
npm run dev
npm run build
npm run check
npm run seed
```

## משתני סביבה מומלצים (שרת)
```env
NODE_ENV=production
SERVER_PORT=4100
MONGO_URI=...
CLIENT_ORIGIN=...

AUTH_ENABLED=true
API_KEY=...

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=180

JOB_WORKER_ENABLED=true
JOB_WORKER_POLL_MS=3000
```

## המלצת הפעלה בפרודקשן
- Process 1: API server
- Process 2: Worker
- שניהם עם restart policy וניטור.

---

## 8. אסטרטגיית בדיקות

## Unit tests
- semver utilities
- diff engines
- validators
- permission policies

## Integration tests
- endpoint contracts
- error mapping
- auth/role checks
- job lifecycle transitions

## E2E tests
- create release -> deploy all -> jobs complete -> site versions updated
- run backup all -> verify -> history visible
- admin sync -> diff -> add/remove admin -> snapshot updated

## Non-functional tests
- load test על jobs queue.
- resilience test לניתוק Mongo/SharePoint זמני.

---

## 9. סיכונים מרכזיים ופעולות מניעה

1. כשל בכתיבה ל-SharePoint
- מניעה: retries + idempotency + audit + rollback plan.

2. התנגשויות jobs על אותו אתר
- מניעה: locking per site/type.

3. privilege escalation
- מניעה: RBAC קשיח + audit deny logs.

4. corruption בנתוני Admins
- מניעה: snapshot before/after + restore snapshot + approvals.

5. false success בפריסה
- מניעה: verification step post-deploy (dist/index/assets + health job).

---

## 10. תוכנית זמן מומלצת (ריאלית)

- שבוע 1: Phase 0-1
- שבוע 2: Phase 2
- שבוע 3: Phase 3
- שבוע 4: Phase 4
- שבוע 5: Phase 5
- שבוע 6: Phase 6-7
- שבוע 7: Phase 8 + Staging hardening
- שבוע 8: Go-Live + Hypercare

---

## 11. הוראות עבודה מיידיות (Next Actions)

1. להפעיל Mongo מקומי ולוודא `npm run seed` עובר.
2. לחבר worker process נפרד (לא רק באותו server process).
3. לממש SharePoint adapter read-only ולהחליף manual health.
4. להוסיף `SiteHealthCheck` collection + endpoints.
5. להגדיר permission matrix מפורט ולחבר ל-UI capability flags.
6. להוסיף cancel job + retry policy מתקדם.
7. לחבר pipeline CI מלא.

---

## 12. נספח - עקרונות תפעול בסביבה סגורה

1. אין פעולות write ללא אישור מפורש של role מתאים.
2. כל פעולת write חייבת Job + Audit + logs.
3. אין פריסה גלובלית בלי dry-run/preview.
4. גיבוי לפני deploy רחב חובה.
5. restore drills תקופתיים (לפחות חודשי).

---

## 13. נספח - מה נחשב "חסום עליה לפרודקשן"

המערכת **חסומה לפרודקשן** אם אחד מהבאים נכון:
- `AUTH_ENABLED=false` בפרודקשן.
- worker לא רץ או לא מנוטר.
- אין backup verification פעיל.
- אין audit זמין לחיפוש.
- אין rollback/runbook בדוקים.

---

סוף מסמך.
