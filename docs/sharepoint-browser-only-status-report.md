# דוח מצב: אין SharePoint בשרת

## הבעיה שהייתה
המערכת הייתה באמצע מעבר: חלק מהמסכים כבר עבדו דרך הדפדפן הפעיל של המשתמש, וחלק מה־jobs עדיין ניסו להריץ SharePoint REST מתוך השרת או ה־worker.

זה יצר כשל קבוע: הדפדפן מחובר ל־SharePoint, אבל השרת לא מחזיק את אותה הזדהות. לכן פעולות שרת מול SharePoint נכשלו או דרשו מושגים שלא צריכים להיות קיימים במערכת.

## הארכיטקטורה הנכונה עכשיו
הכלל פשוט:

**אין SharePoint בשרת.**

השרת לא קורא, לא כותב, לא מבקש Digest ולא מחזיק הזדהות SharePoint. כל פעולה מול SharePoint רצה דרך הדפדפן הפעיל של המשתמש.

השרת אחראי רק ל:

- Mongo ורשומות ניהול.
- יצירת jobs במצב `browser-required`.
- סטטוסים, לוגים ו־Audit.
- שמירת Evidence שהדפדפן החזיר אחרי הפעולה.
- שמירת Snapshots, למשל מנהלים או תוצאות גיבוי.

## פעולות שרצות בדפדפן

| פעולה | איפה רצה | מה השרת עושה |
| --- | --- | --- |
| Health / Digest / Current user | דפדפן | שומר תוצאת בדיקה |
| Backup TXT | דפדפן | יוצר job ושומר backup evidence |
| Restore | דפדפן | יוצר job ושומר restore evidence |
| Deploy | דפדפן | יוצר deployment ושומר upload/read-back evidence |
| Rollback | דפדפן | מטופל כ־Deploy לגרסה ישנה ושומר evidence |
| Provision / Bootstrap | דפדפן | שומר סטטוס אתר ו־path evidence |
| Permissions setup | דפדפן | שומר סטטוס הרשאות ו־evidence |
| Admin live read | דפדפן | שומר snapshot של מקורות מנהלים |
| Admin TXT repair | דפדפן | שומר snapshot ותוצאת תיקון |
| TXT to Mongo migration | דפדפן + שרת Mongo | הדפדפן קורא TXT ומעלה runtime/dist; השרת כותב Mongo ושומר Evidence |

## פעולות שרצות רק בשרת

| פעולה | איפה רצה |
| --- | --- |
| Mongo create / seed / verify | שרת / Builder backend |
| קריאת רשומות Hub | שרת |
| Audit / Jobs / Status | שרת |
| Release metadata ו־artifact metadata | שרת |
| Evidence persistence | שרת |

## מיגרציית TXT ל־Mongo

המעבר מאתר TXT קיים לאתר Mongo מתועד בדוח נפרד:

`docs/sitebuilder-hub-txt-to-mongo-migration-report.md`

גם במיגרציה הזאת הכלל נשאר זהה: הדפדפן קורא וכותב SharePoint, השרת מטפל רק ב־Mongo, release metadata ו־Evidence.

## Jobs
Job שקשור ל־SharePoint לא מתבצע ב־worker. הוא נוצר כ־`browser-required`.

המסך הרלוונטי מפעיל את הפעולה בדפדפן, ואז שולח Evidence לשרת. אחרי שמירת ה־Evidence, ה־Job מתעדכן ל־succeeded או failed.

### מיגרציית Jobs ישנים
אם קיימים ב־Mongo jobs היסטוריים עם `backend-sharepoint`, `backend-service-auth-required` או `blocked-service-auth-required`, יש סקריפט חד־פעמי שממיר אותם למסלול דפדפן או מסמן אותם כהיסטוריים.

הרצה יבשה:

```bash
npm run migrate:sharepoint-browser-only
```

הרצה שמעדכנת את Mongo:

```bash
npm run migrate:sharepoint-browser-only -- --apply
```

הסקריפט לא יוצר חיבור SharePoint. הוא מעדכן רק רשומות Jobs ב־Mongo.

## בדיקות עיקריות

- `tests/browserRequiredBackupQueue.test.ts` מכסה גיבוי מתוזמן/ידני כ־browser-required.
- `tests/backupRestoreApproval.test.ts` מכסה restore כ־browser-required ושמירת browser restore evidence.
- `tests/releaseBatchDeploy.test.ts` מכסה Deploy דרך browser evidence.
- `tests/versionRollbackApproval.test.ts` מכסה Rollback כ־browser-required ו־Deploy evidence לגרסה ישנה.
- `tests/siteBootstrap.test.ts` ו־`tests/siteBootstrapWorker.test.ts` מכסות Bootstrap כפעולת דפדפן בלבד.
- `tests/adminRepairApproval.test.ts` מכסה Admin TXT repair כ־browser-required ושמירת snapshot/evidence.
- `tests/browserAdminEvidence.test.ts` מכסה Admin live-read evidence.
- בדיקות policy צריכות לוודא שפעולות SharePoint החדשות מסומנות `browser-supported` ולא `backend-sharepoint`.

## שורה תחתונה
אם פעולה צריכה לגעת ב־SharePoint, היא צריכה כפתור מקומי בדפדפן ושמירת Evidence. אם פעולה לא צריכה SharePoint, היא יכולה לרוץ בשרת מול Mongo.

אין צורך ואין שימוש במסלול SharePoint שרתי.
