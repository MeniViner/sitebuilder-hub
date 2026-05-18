# Site Builder Hub (MVP1.1)

מערכת ניהול מרכזית נפרדת לאתרי Site Builder. ה-Hub כולל פעולות SharePoint מבוקרות דרך worker, approval gates, audit ולוגים מקוטלגים; אסטרטגיית SharePoint auth אמיתית עדיין מוגדרת דרך env ולא כחיבור משתמש production מלא.

## דרישות מקדימות
- Node.js 20+
- npm 10+
- MongoDB מקומי פעיל

## התקנה
```bash
cd sitebuilder-hub
npm run install:all
```

## משתני סביבה
1. העתיקו `sitebuilder-hub/.env.example` ל-`sitebuilder-hub/.env`
2. העתיקו ערכים רלוונטיים גם ל-`sitebuilder-hub/server/.env` ול-`sitebuilder-hub/client/.env`

Root `.env.example`:
- `SERVER_PORT=4100`
- `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub`
- `CLIENT_ORIGIN=http://localhost:5177`

Client `.env.example`:
- `VITE_API_BASE_URL=http://localhost:4100/api`

## Console Debug Logging
המערכת כוללת logging מקוטלג בשרת ובקליינט. כל קטגוריה נשלטת עם `true` / `false` ב-env.

Server `.env`:
- `LOG_ALL=true` מדליק את כל קטגוריות השרת.
- `LOG_FORMAT=pretty` מציג לוגים קריאים בקונסול. `json` מתאים לאיסוף לוגים.
- `LOG_VERBOSE_PAYLOADS=true` / `LOG_HTTP_PAYLOADS=true` מוסיפים bodies ו-headers אחרי redaction.
- קטגוריות: `LOG_SERVER`, `LOG_ENV`, `LOG_HTTP`, `LOG_AUTH`, `LOG_RATE_LIMIT`, `LOG_DB`, `LOG_JOBS`, `LOG_AUDIT`, `LOG_SITES`, `LOG_RELEASES`, `LOG_BACKUPS`, `LOG_ADMINS`, `LOG_OPERATIONS`, `LOG_SHAREPOINT`, `LOG_SECURITY`, `LOG_ERRORS`, `LOG_PERFORMANCE`.

Client `client/.env`:
- `VITE_LOG_ALL=true` מדליק את כל קטגוריות הקליינט.
- `VITE_LOG_VERBOSE_PAYLOADS=true` / `VITE_LOG_API_PAYLOADS=true` מוסיפים request/response payloads אחרי redaction.
- קטגוריות: `VITE_LOG_APP`, `VITE_LOG_API`, `VITE_LOG_AUTH`, `VITE_LOG_ROUTER`, `VITE_LOG_UI`, `VITE_LOG_STATE`, `VITE_LOG_STORAGE`, `VITE_LOG_BROWSER_FETCH`, `VITE_LOG_PERFORMANCE`, `VITE_LOG_ERRORS`.

כברירת מחדל ערכים רגישים כמו tokens, cookies, API keys ו-personal numbers מוסתרים. רק אם חייבים ממש, `LOG_SHOW_SENSITIVE=true` או `VITE_LOG_SHOW_SENSITIVE=true` יציגו אותם.

## MongoDB בדוקר
```bash
docker run -d --name sitebuilder-mongo -p 27017:27017 mongo:7
```

## פקודות הרצה
```bash
npm run dev
npm run dev:server
npm run dev:client
npm run build
npm run check
npm run seed
```

## כתובות עבודה
- Backend: `http://localhost:4100`
- Frontend: `http://localhost:5177`

## MVP1.1 כולל
- API אחיד (`ok/data/meta` + פורמט שגיאה עקבי)
- CRUD מלא לרשומות אתר
- ארכוב soft-delete
- Dashboard RTL עם חיפוש/סינון/מיון/מצבי טעינה-ריק-שגיאה
- סטטוס עסקי + סטטוס תקינות נגזר
- עמוד פרטי אתר עם עדכון ידני לבדיקת תקינות
- seed ריאליסטי ואידמפוטנטי

## יכולות ליבה שנוספו
- בסיס Auth + Role Guard (`viewer`/`operator`/`admin`) באמצעות `x-api-key` (ניתן לכיבוי בסביבת פיתוח)
- Rate limit בסיסי + `x-request-id`
- Health endpoints:
  - `GET /api/health/live`
  - `GET /api/health/ready`
  - `GET /api/health`
- מרכז גרסאות ופריסות:
  - `GET/POST /api/releases`
  - `POST /api/releases/:id/deploy-all`
  - `POST /api/sites/:id/deploy-version/plan`
  - `POST /api/sites/:id/deploy-version`
  - `POST /api/sites/:id/rollback-version/plan`
  - `POST /api/sites/:id/rollback-version`
  - `GET /api/sites/:id/deployments`
  - `POST /api/version/next`
  - `GET /api/version/status`
- מרכז גיבויים:
  - `GET /api/backups`
  - `POST /api/backups/run-all`
  - `GET /api/sites/:id/backups`
  - `POST /api/sites/:id/backups`
  - `POST /api/backups/:id/verify`
  - `POST /api/backups/:id/restore-plan`
  - `POST /api/backups/:id/restore`
- ניהול Admins פר אתר:
  - `GET /api/sites/:id/admins`
  - `POST /api/sites/:id/admins/sync`
  - `POST /api/sites/:id/admins`
  - `DELETE /api/sites/:id/admins/:adminId`
  - `GET /api/sites/:id/admins/diff`
- Jobs + worker + audit:
  - `GET /api/jobs`
  - `POST /api/jobs/:id/approve`
  - `POST /api/jobs/:id/reject`
  - `POST /api/jobs/:id/rerun`
  - `GET /api/audit`

## MVP2 מוצע
- Health checks אמיתיים מול SharePoint
- pipeline מבוקר ל-create/deploy
- jobs queue עם retries ו-audit log
- הרשאות משתמשים ורמות גישה
- מרכז לוגים ופעולות תיקון אוטומטיות (admins/permissions)
