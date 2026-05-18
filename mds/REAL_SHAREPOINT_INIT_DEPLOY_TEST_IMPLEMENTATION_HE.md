# תוכנית יישום להרצת Init / Deploy / Test אמיתית מול SharePoint

מסמך זה מתאר מה צריך להיות קיים לפני שמריצים את ה־Hub מול SharePoint אמיתי, ומה הסדר הנכון לבדיקת init, deploy ו־test בסביבה אמיתית.

## מצב נוכחי

- ה־Hub כבר כולל Registry של אתרים, Jobs, Releases, Backups, Audit, Admin snapshots ו־Operations capabilities.
- קיימים endpoints לתכנון והרצה של פעולות SharePoint:
  - `GET /api/sites/:id/provision/plan`
  - `POST /api/sites/:id/provision`
  - `POST /api/sites/:id/backups/plan`
  - `POST /api/sites/:id/backups`
  - `GET /api/releases/:id/artifact/validate`
  - `POST /api/sites/:id/deploy-version/plan`
  - `POST /api/sites/:id/deploy-version`
  - `POST /api/sites/:id/admins/live-read`
  - `POST /api/sites/:id/health-check/sharepoint-readonly`
- קיימת שכבת SharePoint write guard דרך:
  - `SHAREPOINT_WRITE_ENABLED`
  - `SHAREPOINT_AUTH_COOKIE`
  - `SHAREPOINT_BEARER_TOKEN`
  - `SHAREPOINT_REQUEST_TIMEOUT_MS`
- יכולות ה־Operations ו־Plans מחזירות עכשיו הפרדה מפורשת בין:
  - מוכנות לתכנון read-only.
  - מוכנות להרצה כותבת.
  - חסמי `SHAREPOINT_WRITE_ENABLED` / auth material / request digest.
- קיימת הרשאת Bootstrap לפי personal number.
- המשתמשים `s8856096` ו־`s8856095` מוגדרים גם כ־hardcoded always allowed users, ללא תלות ב־env.

## סטטוס Preflight/Readiness שנוסף

- `GET /api/operations/capabilities` מחזיר `sharePoint.digest`, `sharePoint.authModes`, `readiness.writePreflight`, ו־readiness נפרד ל־init/provision, backup ו־deploy.
- `GET /api/operations/sites/:id/summary` מחזיר `operationReadiness` לפי האתר, כולל חסמים שמבוססים על capability ועל snapshot health.
- `GET /api/sites/:id/provision/plan` מחזיר `summary.readyForProvisionExecution`, `blockers`, ו־capabilities ללא הרצת כתיבה.
- `POST /api/sites/:id/backups/plan` מחזיר `summary.readyForBackup` עבור מקור הנתונים ו־`summary.readyForBackupExecution` עבור הרצה אמיתית.
- `POST /api/sites/:id/deploy-version/plan` מחזיר `summary.readyForDeploy` עבור artifact תקין ו־`summary.readyForDeployExecution` עבור העלאה אמיתית ל־SharePoint.
- קריאות read-only ל־health/backup plan משתמשות ב־SharePoint auth headers אם הוגדרו, בלי לחשוף secrets בתשובה.
- יצירת Jobs ל־backup/deploy חסומה עכשיו אם `SHAREPOINT_WRITE_ENABLED` או auth/digest prerequisites אינם זמינים, כך שלא נוצרים jobs כותבים כאשר השרת במצב read-only.

## מה עדיין צריך להשלים לפני הרצה אמיתית

### 1. אימות זהות וכניסה ל־Hub

צריך לוודא שזרימת ההתחברות ב־UI עושה בפועל:

1. קריאה ל־`POST /api/auth/login-personal-number`.
2. שמירת ה־personal number בצד לקוח.
3. שליחת `x-personal-number` בכל קריאת API מוגנת.
4. הצגת מקור ההרשאה:
   - `hardcoded`
   - `bootstrap`
   - `site-admin`
   - `api-key`
   - `dev`

קובצי קוד רלוונטיים:

- `client/src/api/sitesApi.ts`
- `server/src/services/personal-auth.service.ts`
- `server/src/middlewares/auth.ts`
- `server/src/controllers/auth.controller.ts`

קריטריון קבלה:

- כניסה עם `s8856096` מצליחה גם כאשר Mongo ריק.
- כניסה עם `s8856095` מצליחה גם כאשר Mongo ריק.
- personal number אחר נכשל כאשר אינו מופיע ב־hardcoded, env, או Site admin snapshots.

### 2. בדיקת env לפני כתיבה ל־SharePoint

לפני כל פעולה אמיתית צריך מסך או endpoint שמציג בבירור:

- האם `SHAREPOINT_WRITE_ENABLED=true`.
- האם קיים `SHAREPOINT_AUTH_COOKIE` או `SHAREPOINT_BEARER_TOKEN`.
- האם `CLIENT_ORIGIN` נכון.
- האם Mongo מחובר.
- האם כתובת ה־SharePoint site תקינה.
- האם ה־Hub מזהה את paths של:
  - `siteDB`
  - `siteUsersDb`
  - `siteDB/dist`
  - `siteDB/siteAssets`
  - TXT files
  - backup root

קובצי קוד רלוונטיים:

- `server/src/config/env.ts`
- `server/src/services/operations.service.ts`
- `server/src/services/sharepointOperationClient.ts`
- `server/src/utils/sitebuilderPaths.ts`

קריטריון קבלה:

- בלי write credentials, פעולות כתיבה לא רצות.
- כאשר חסר auth material, מתקבלת שגיאת יכולת ברורה ולא ניסיון כתיבה חלקי.

### 3. SharePoint auth אמיתי

צריך להחליט וליישם אסטרטגיית authentication אמיתית:

אפשרות A: Cookie / FedAuth מתוך session ארגוני.

- מתאים להרצה פנימית זמנית.
- פשוט יחסית.
- פחות טוב לפרודקשן ארוך טווח.

אפשרות B: Bearer token / Graph / SharePoint app registration.

- מתאים יותר לפרודקשן.
- דורש הרשאות Azure/Entra.
- דורש ניהול secrets ו־token refresh.

אפשרות C: פעולה browser-based כאשר צריך session של המשתמש.

- מתאים לפעולות שמחייבות context של SharePoint user.
- פחות מתאים ל־jobs שרצים בשרת.

צריך ליישם באופן מלא:

- Digest acquisition דרך `/_api/contextinfo` כאשר משתמשים ב־REST write.
- שמירה זמנית של `X-RequestDigest`.
- retry כאשר digest פג.
- logging מלא של status codes בלי לחשוף secrets.

קובצי קוד רלוונטיים:

- `server/src/services/sharepointOperationClient.ts`

קריטריון קבלה:

- `GET` ל־SharePoint עובד מול אתר אמיתי.
- `POST` עם digest עובד מול ספריית בדיקה.
- כשל הרשאה מחזיר הודעה מדויקת ולא נכשל בשקט.

### 4. Init אמיתי לאתר חדש

פעולת init צריכה להיות idempotent: אם ספרייה או קובץ כבר קיימים, לא לשבור את האתר.

הפעולה צריכה ליצור או לוודא קיום של:

- Document Library: `siteDB`
- Document Library: `siteUsersDb`
- Folder: `siteDB/dist`
- Folder: `siteDB/siteAssets`
- Folder: backups root
- קובצי TXT/JSON בסיסיים לפי מודל Site Builder:
  - `widgets_data.txt`
  - `nav_data.txt`
  - `theme_data.txt`
  - `users_data.txt`
  - admin/permissions files אם קיימים במודל המקורי
- manifest ראשוני שמכיל:
  - site code
  - created at
  - created by
  - app version
  - paths resolved

קובצי קוד רלוונטיים:

- `server/src/services/siteProvisioning.service.ts`
- `server/src/utils/sitebuilderPaths.ts`
- `server/src/services/sharepointOperationClient.ts`

קריטריון קבלה:

- ריצה ראשונה יוצרת את כל המבנה.
- ריצה שנייה לא מוחקת נתונים ולא נכשלת בגלל קיים.
- Audit log נוצר לכל שלב.
- Job log מראה מה נוצר ומה כבר היה קיים.

### 5. Build artifact אמיתי של Site Builder המקורי

לפני deploy צריך artifact ברור של ה־dist:

- build של האפליקציה המקורית.
- תיקיית artifact immutable לפי version.
- `index.html` קיים.
- assets קיימים.
- manifest/hash לכל קובץ.
- בדיקה שאין absolute local paths בתוך artifact.

קובצי קוד רלוונטיים:

- `server/src/services/deployArtifact.service.ts`
- `server/src/services/releases.service.ts`
- `server/src/services/jobs.worker.ts`

קריטריון קבלה:

- `GET /api/releases/:id/artifact/validate` מחזיר `readyForDeploy=true`.
- יש `index.html`.
- יש רשימת files עם `sha256`.

### 6. Deploy אמיתי ל־SharePoint

ה־deploy צריך לבצע:

1. validation ל־artifact.
2. backup preflight לפני כתיבה.
3. upload של כל dist ל־`siteDB/dist`.
4. upload/update של manifest.
5. שמירת deployment record ב־Mongo.
6. Audit log.
7. Post-deploy read check לכל קבצי החובה.

קובצי קוד רלוונטיים:

- `server/src/services/deployArtifact.service.ts`
- `server/src/services/jobs.worker.ts`
- `server/src/models/SiteVersionDeployment.ts`
- `server/src/services/sharepointOperationClient.ts`

קריטריון קבלה:

- deploy job נכנס ל־`completed`.
- הקבצים קיימים ב־SharePoint.
- `index.html` נטען מ־SharePoint.
- deployment record מכיל version, siteId, files count, actor, timestamps.

### 7. Backup אמיתי לפני ואחרי deploy

צריך לוודא ש־backup אמיתי לא רק מתכנן אלא גם מעתיק נתונים:

- הורדת קבצי TXT/JSON.
- הורדת manifest.
- שמירת snapshot לפי site + timestamp.
- checksum לכל קובץ.
- status ברור:
  - `planned`
  - `running`
  - `completed`
  - `failed`
  - `verified`

קובצי קוד רלוונטיים:

- `server/src/services/backupPlan.service.ts`
- `server/src/services/realBackup.service.ts`
- `server/src/services/backups.service.ts`
- `server/src/models/SiteBackup.ts`

קריטריון קבלה:

- backup לפני deploy נוצר אוטומטית או נדרש באופן מפורש.
- ניתן לראות אילו קבצים גובו.
- verification קורא את ה־backup storage ומוודא checksum.

### 8. בדיקות Health אחרי Init/Deploy

אחרי init/deploy צריך להריץ:

- `POST /api/sites/:id/health-check/sharepoint-readonly`
- בדיקת קיום `siteDB`
- בדיקת קיום `siteUsersDb`
- בדיקת קיום `siteDB/dist/index.html`
- בדיקת קיום TXT files
- בדיקת הרשאות קריאה
- בדיקת הרשאות כתיבה אם write enabled

קריטריון קבלה:

- health status הוא `healthy` או פירוט מדויק למה לא.
- אין מצב שבו deploy הצליח אבל health לא מזהה את האתר.

### 9. בדיקת UI אמיתית לאחר deploy

צריך לפתוח את ה־URL שנטען מ־SharePoint ולוודא:

- `index.html` נטען.
- assets נטענים.
- האפליקציה קוראת TXT/JSON מה־paths הנכונים.
- admin user מזוהה.
- אין שגיאות console קריטיות.
- פעולות שמירה כותבות ל־TXT הנכון.

בדיקה זו לא צריכה לרוץ אוטומטית בלי החלטה, כי היא תלויה בהרשאות וב־SharePoint session.

קריטריון קבלה:

- האתר עובד מתוך SharePoint ולא רק מתוך localhost.
- המשתמש המחובר מזוהה לפי personal number / SharePoint identity.

### 10. Rollback

לפני deploy אמיתי צריך לממש rollback:

- בחירת backup קיים.
- dry-run restore plan.
- שחזור TXT/JSON.
- שחזור manifest.
- אופציונלית שחזור dist קודם.
- Audit מלא.

קובצי קוד רלוונטיים:

- `server/src/services/backups.service.ts`
- `server/src/services/realBackup.service.ts`
- `server/src/services/jobs.worker.ts`

קריטריון קבלה:

- ניתן להחזיר אתר למצב קודם בלי מחיקה ידנית ב־SharePoint.

## סדר בדיקה מומלץ בסביבה אמיתית

1. להריץ Mongo ושרת Hub.
2. להתחבר עם `s8856096` או `s8856095`.
3. ליצור Site record ב־Hub עם SharePoint URL אמיתי.
4. להריץ read-only health.
5. להריץ provision plan.
6. לבדוק ידנית שה־plan מצביע ל־paths נכונים.
7. להגדיר SharePoint auth material.
8. להפעיל `SHAREPOINT_WRITE_ENABLED=true` רק בסביבת בדיקה.
9. להריץ provision.
10. לבדוק ב־SharePoint שנוצרו libraries/folders/files.
11. ליצור Release עם `artifactRef`.
12. להריץ artifact validation.
13. להריץ deploy plan.
14. להריץ backup plan.
15. להריץ backup אמיתי.
16. להריץ deploy אמיתי.
17. להריץ post-deploy health.
18. לפתוח את האתר מתוך SharePoint ולבדוק טעינה בפועל.
19. לבדוק Audit ו־Job logs.
20. לכבות `SHAREPOINT_WRITE_ENABLED` בסיום הבדיקה.

## כללי בטיחות

- לא להריץ write/deploy/init מול אתר production לפני שהריצה עברה באתר בדיקה.
- לא לשמור cookies או bearer tokens בקוד.
- לא להדפיס secrets בלוגים.
- לא למחוק קבצים ב־SharePoint כחלק מ־deploy רגיל.
- כל write job חייב להיות traceable ב־Audit.
- כל deploy חייב להיות מגובה או לפחות לכלול backup plan מאושר.

## החלטות שעדיין צריך לקבל

- האם Hub production ירוץ בתוך הרשת הארגונית או מחוץ לה.
- האם auth ל־SharePoint יהיה user delegated או app-only.
- איפה נשמרים backup artifacts.
- מי מורשה להפעיל write jobs.
- האם יצירת אתר חדש כוללת גם יצירת SharePoint site/subsite או רק הכנת libraries באתר קיים.
- האם deploy מחליף את כל `dist` או מעלה קבצים באופן incremental.
