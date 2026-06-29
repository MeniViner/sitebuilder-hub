# Create New Site Field Explanations

This audit maps the current `Create New Site` / `Create New Mongo Site` wizard to the `Site` payload, server validators, persisted model, and Mongo creation plan.

## Field Map

| Current UI label | Internal field/property | Receiver | Required | Manual or generated | Area | Valid example | If wrong | Current validation | Missing validation / risk | Advanced? | Preview? | Suggested Hebrew label | Suggested Hebrew help |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| שם האתר | `displayName` | `POST /api/sites`, `Site.displayName`, Mongo plan | Required | Manual | Basic | `פורטל משאבי אנוש` | Hard to identify site in registry, reports and Audit | Client + Zod required | None | No | No | שם האתר | השם העסקי שמופיע ב־HUB, בדוחות וב־Audit. |
| קוד אתר / נתיב SharePoint | `siteCode` | `Site.siteCode`, path resolver, identity key | Required | Manual, then defaults generated | Basic / SharePoint | `hr-portal` | Paths, runtime config and final URL may point to wrong place | Client + Zod required | Collision must remain physical/runtime based | No | Yes | קוד אתר / נתיב SharePoint | שם קצר לבניית נתיבי SharePoint; לא מזהה יחיד אם היעד הפיזי שונה. |
| מזהה אתר במערכת Site Builder | `builderSiteId`, `mongoSiteId` | Runtime config, Builder backend API, `Site` | Required for Mongo | Manual, default can match `siteCode` | Basic / Mongo | `hr-portal` | Frontend may load wrong Mongo site or no data | Client required for Mongo plan | Normalize consistently with backend | No | Yes | מזהה אתר במערכת Site Builder | ה־siteId שה־Frontend וה־Backend משתמשים בו מול ה־API. |
| תיאור | `description` | `Site.description` | Optional | Manual | Basic | `פורטל לצוות משאבי אנוש` | No runtime break; less context | None | None | No | No | תיאור | טקסט ניהולי קצר. לא משפיע על SharePoint, Mongo או פריסה. |
| סביבת יעד | `environment` | `Site.environment` | Optional | Manual | Basic | `production` | Reporting/caution level may be wrong | Enum | None | No | No | סביבה | סיווג dev/test/staging/production לצורך תפעול ודוחות. |
| יחידה | `unitName` | `Site.unitName` | Optional | Manual | Basic | `אגף דיגיטל` | Search/reporting context wrong | None | None | No | No | יחידה | היחידה או הצוות שמחזיקים באתר. |
| סוג אחסון נתונים | `storageBackend` | `Site.storageBackend`, readiness/runtime logic | Required for create-new | Owner choice, default Mongo | Basic / Mongo | `mongo` | Wrong flow, runtime config and admin source | Enum | Needs clear owner copy | No | Yes | סוג אחסון: Mongo | SharePoint מארח קבצים; Mongo שומר נתונים חיים דרך Builder backend. |
| סטטוס | `status` | `Site.status` | Defaulted | Generated for create-new, manual for edit | Lifecycle | `draft` | New site may appear active too early | Enum | Hide from new-site decisions | Yes for create-new | Yes | סטטוס HUB | מצב ניהולי. אתר חדש מתחיל כטיוטה עד אימות מלא. |
| גרסה נוכחית | `version` | `Site.version` | Optional | Default/manual | Deploy | `1.0.0` | Version reporting wrong | None | SemVer not enforced | Yes for create-new | No | גרסה נוכחית | גרסה ידועה ל־HUB; לא הוכחת פריסה. |
| הערות | `notes` | `Site.notes` | Optional | Manual | Admin | `נוצר ל־UAT` | No runtime break | None | None | No | No | הערות | הערות ניהוליות פנימיות בלבד. |
| שם בעל האתר | `ownerName` | `Site.ownerName`, seed display | Optional | Manual | Admins | `ישראל ישראלי` | Ownership context weak | None | Could require for production | No | No | שם בעל האתר | האדם האחראי עסקית ותפעולית על האתר. |
| מספר אישי | `ownerPersonalNumber` | `Site.ownerPersonalNumber`, seed docs | Required for create-new | Manual | Admins | `1234567` | Initial owner/admin seed may be unreliable | Client required | Format not enforced | No | No | מספר אישי של בעל האתר | מזהה פנימי לאתחול בעלים ומנהלים. |
| מייל בעל האתר | `ownerEmail` | `Site.ownerEmail`, bootstrap options, seed docs | Required for create-new | Manual | Admins | `owner@example.com` | Owner may not get permissions or be recognized | Email validation | Domain policy not enforced | No | No | מייל בעל האתר | משמש לבעלות והרשאות ראשוניות. זה לא API key. |
| טלפון | `ownerPhone` | `Site.ownerPhone` | Optional | Manual | Admins | `050-0000000` | No runtime break | None | None | No | No | טלפון | פרט קשר בלבד. |
| רשימת מנהלים | `txtAdmins` from `initialAdminsText` | `Site.txtAdmins`, Mongo `users_data.txt` seed docs | Optional if owner exists | Manual | Admins / Mongo seed | `שם | 1234567 | admin@example.com` | Site may lack usable initial admins | Email validation | Personal-number format not enforced | No | Count | מנהלים ראשוניים | שורה לכל מנהל; באתר Mongo נזרע ל־users_data.txt בתוך seed docs. |
| כתובת אתר SharePoint | `sharePointSiteUrl`, `sharePointHost` | Path resolver, browser connector, `Site` | Required | Manual | SharePoint hosting | `https://portal.army.idf/sites/hr-portal` | All SharePoint paths/final URL can be wrong | URL validation | Connectivity checked later | No | Yes | כתובת אתר SharePoint | המקום שבו קבצי האתר יתארחו. נתוני Mongo לא נשמרים שם. |
| כתובת Backend של Site Builder | `backendApiUrl` | Mongo plan, runtime config, `Site` | Required for Mongo | Manual/environment | Mongo backend | `https://builder.example.local` | Site loads but cannot read/write Mongo data | Required + URL shape; server allowlist | Reachability during plan/execute | No | Yes | כתובת Backend של Site Builder | שרת API ל־Mongo backend. זו לא כתובת SharePoint. |
| קישור סופי לאתר | `finalAppUrl` | Deploy verification, `Site.finalAppUrl` | Generated, override optional | Generated from `siteDB/dist/index.html` | SharePoint hosting / Deploy | `https://portal.army.idf/sites/hr-portal/siteDB/dist/index.html` | Users open missing/wrong app | URL validation if supplied | Readiness after deploy | Yes | Yes | קישור סופי לאתר | הכתובת שמשתמשים יפתחו אחרי הפריסה. |
| ספריית siteDB | `siteDbLibrary` | Path resolver, health, deploy | Generated default, override optional | Generated as `siteDB` | SharePoint hosting / Advanced | `siteDB` | Deploy/health look in wrong library | Defaulted | Existence checked later | Yes | Yes | ספריית siteDB | ספריית SharePoint לאירוח `dist`, assets וקבצי תאימות. |
| ספריית siteUsersDb | `usersDbLibrary` | Path resolver, permissions/admin compatibility | Generated default, override optional | Generated as `siteUsersDb` | SharePoint hosting / Advanced | `siteUsersDb` | Admin compatibility/permissions wrong | Defaulted | Existence checked later | Yes | Yes | ספריית siteUsersDb | ספריית SharePoint היסטורית למשתמשים והרשאות. |
| ספריית Bootstrap | `bootstrapLibrary` | Path resolver, `Site.bootstrapLibrary` | Optional | Generated | Bootstrap / Advanced | `SiteAssets` | Bootstrap URL wrong | Defaulted | Existence checked later | Yes | Yes | ספריית Bootstrap | מיקום עזר ראשוני; לא האתר הסופי. |
| תיקיית Bootstrap | `bootstrapFolder` | Path resolver, `Site.bootstrapFolder` | Optional | Generated | Bootstrap / Advanced | `sitebuilder-bootstrap` | Bootstrap setup URL wrong | Defaulted | None | Yes | Yes | תיקיית Bootstrap | תיקייה זמנית לקבצי הקמה לפני שהאתר הסופי מוכן. |
| נתיב runtime config | `runtimeConfigPath`, `runtimeConfigUrl` | Runtime config upload/validate, `Site` | Generated, override optional | Generated inside `siteDB/dist` | Runtime config / Advanced | `/sites/hr-portal/siteDB/dist/sitebuilder-runtime-config.json` | Frontend will not know Mongo backend/siteId | Generated; client checks site-root for absolute path | Readback later | Yes | Yes | נתיב runtime config | קובץ ההגדרות שהאתר קורא בזמן טעינה כדי לעבוד מול Mongo backend. |
| הפניה להרשאת API | `builderApiKeyRef` | Credential resolver, Builder backend calls | Required for Mongo | Manual reference; secret resolved by server | Mongo backend / Advanced | `SITE_BUILDER_BACKEND_API_KEY` | HUB cannot call Builder backend; raw secret exposure risk | Required; likely raw API key blocked | Exact credential resolved server-side | Yes | Status only | הפניה להרשאת API | שם הגדרה שמחזיקה את המפתח. לא מזינים את המפתח עצמו. |
| שם Collection במונגו | `safeCollectionName` | Builder backend health, identity key, `Site` | Optional | Auto-generated unless overridden | Mongo backend / Advanced | `site_hr_portal` | Wrong collection or mismatch check failure | Optional; safe format if supplied | Exact backend policy checked later | Yes | Yes | שם Collection במונגו | שם ה־collection הפיזי. בדרך כלל המערכת יוצרת לבד. |
| סביבת Mongo | `mongoEnvironment` | `Site.mongoEnvironment`, Mongo status | Optional | Usually server/environment | Mongo backend / Advanced | `prod-il` | Documentation/status misleading | None | None | Yes | No | סביבת Mongo | מידע תיעודי על סביבת Mongo מאחורי Builder backend. |
| מסד נתונים Mongo | `mongoDatabase` | `Site.mongoDatabase`, Mongo status | Optional | Usually server/environment | Mongo backend / Advanced | `sitebuilder` | Documentation/status misleading | None | None | Yes | No | מסד נתונים Mongo | שם DB בצד Builder backend; לרוב לא נדרש באשף. |
| מיקום widgets_data.txt | `widgetsDbTarget` | Path resolver `txtFiles.widgets` | Optional | Default `users` | Compatibility / Advanced | `users` | Legacy widgets mapping wrong | Enum | None | Yes | Yes | מיקום widgets_data.txt | מיפוי תאימות לקובץ legacy; באתר Mongo נוצר כ־seed doc. |
| מחבר SharePoint | derived UI / connector mode | Browser connector / backend jobs | Informational | Generated by flow | SharePoint connector / Advanced | `browser-sharepoint` | Owner may expect automatic server write | Disabled select | Capability checked during operation | Yes | Plan steps | מחבר SharePoint | מציג איך פעולה מול SharePoint תרוץ: קריאה בלבד, דפדפן או שרת מורשה. |
| Runtime config URL | `runtimeConfigUrl` | Runtime validation display, `Site` | Generated | Generated | Runtime config / Preview | `https://portal.army.idf/.../sitebuilder-runtime-config.json` | Verification checks wrong URL | Generated | Readback later | Yes | Yes | כתובת runtime config | כתובת קריאה לקובץ ההגדרות בזמן טעינה. |
| נתיבי TXT legacy | `resolvedPaths.txtFiles.*` | Compatibility paths / seed docs | Generated | Generated | Compatibility / Advanced | `.../siteAssets/widgets_data.txt` | Legacy compatibility/seed mapping wrong | Generated | Existence later | Yes | Yes | נתיבי תאימות TXT | שמות קבצים היסטוריים שנשמרים כמיפוי/seed docs באתר Mongo. |
| פריסה ראשונית | `initialDeploy` selection | Create flow after provisioning | Required unless intentionally skipped | Auto-selected latest compatible Release, manual compatible Release, or explicit skip | Deploy | Browser deploy to exact `dist` after `siteDB` / `siteUsersDb` / `dist` / runtime config are verified | Wrong artifact can deploy a frontend that cannot read the chosen storage backend | Client compatibility filter + server artifact manifest validation | Unknown compatibility must not auto-select; release-specific folders must be derived before upload | No | Yes | פריסה ראשונית | בוחרים Release תואם בתוך תהליך היצירה; התיקיות הנדרשות נוצרות לפני העלאה ו־runtime config נשמר. |

## Basic Fields

- שם האתר
- קוד אתר / נתיב SharePoint
- מזהה אתר במערכת Site Builder
- סביבה
- סוג אחסון: Mongo
- כתובת אתר SharePoint
- כתובת Backend של Site Builder
- בעל האתר
- מנהלים ראשוניים

## Advanced Fields

- siteDB / `siteDbLibrary`
- siteUsersDb / `usersDbLibrary`
- siteAssets and TXT compatibility paths
- dist root / final app URL override
- bootstrap folder/library
- runtime config path/url override
- safeCollectionName
- credential reference
- Mongo environment/db metadata
- widgets_data.txt mapping
- SharePoint connector/job mode

## Generated Preview

- final app URL
- siteDB root
- siteUsersDb root
- dist root
- runtime config path and URL
- safeCollectionName strategy
- legacy TXT compatibility paths
- bootstrap setup URL

## Validation Notes

The wizard now explains what is wrong, why it matters, and how to fix it for required fields, URL shape, owner email, Builder backend URL, credential reference, likely raw API-key input, explicit `safeCollectionName`, absolute runtime config paths, and initial admin email rows.

Environment-dependent checks remain in the server plan/execution layer: SharePoint existence, document libraries, Builder backend allowlist, credential resolution, duplicate physical/runtime identity, runtime config readback, seed docs, backup capability, and deploy readiness.
