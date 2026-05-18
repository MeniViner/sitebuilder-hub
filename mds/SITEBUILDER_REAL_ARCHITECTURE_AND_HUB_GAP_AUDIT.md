# Site Builder Real Architecture and Hub Gap Audit

תאריך בדיקה: 2026-05-13  
סביבת עבודה: `C:\Users\MeniV\OneDrive - click\Desktop\personal\projects\idf\siteBuilder`  
מגבלת הבדיקה: בוצעה חקירה סטטית ובדיקות בטוחות בלבד. לא הורצו סקריפטי deploy/init/write מול SharePoint, ולא בוצעו קריאות כתיבה אמיתיות ל-SharePoint.

## 1. Executive summary

הפרויקט המקורי של Site Builder הוא אפליקציית React/Vite שמאוחסנת בפועל מתוך SharePoint כקבצי `dist` תחת Document Library בשם `siteDB`, בדרך כלל בנתיב:

```text
https://<host>/sites/<siteCode>/siteDB/dist/index.html
```

האפליקציה נטענת כ-SPA עם `HashRouter`, ולכן מסכי ניהול נטענים כנתיבי hash, למשל:

```text
https://<host>/sites/<siteCode>/siteDB/dist/index.html#/admin
```

המידע של האתר נשמר כקבצי `.txt` שמכילים JSON. כיום יש שכבה קנונית חדשה יחסית סביב `bihs_master_config_v1.txt`, אך עדיין קיימים ומשמשים קבצי legacy כמו `users_data.txt`, `widgets_data.txt`, `nav_data.txt`, `theme_data.txt` ועוד. יש גם מצב היברידי חשוב: רוב הקונפיגורציה עוברת דרך master config, אבל סקרים והצבעות של widgets עדיין עוברים דרך `widgets_data.txt`.

האינטגרציה האמיתית מול SharePoint מבוססת על `fetch` בדפדפן עם `credentials: include`, על session/cookies של המשתמש המחובר, ועל REST endpoints של SharePoint כמו `/_api/contextinfo`, `/_api/web/lists/GetByTitle(...)`, `/_api/web/GetFolderByServerRelativeUrl(...)`, `Files/add`, `ensureuser`, `siteusers`, `associatedownergroup`, ו-`sitegroups`. אין שכבת axios מרכזית. רוב פעולות TXT משתמשות ב-GET/PUT ישיר לכתובת הקובץ, ורק יצירת תיקיות, העלאת קבצים בינאריים, הרשאות וספריות משתמשות ב-REST עם `X-RequestDigest`.

מה שכבר עובד במקור:

- פתרון נתיבים לפי env דרך `src/config/sharepointPaths.js`.
- קריאת/כתיבת TXT/JSON מ-SharePoint דרך `src/utils/sharepointUtils.js`.
- bootstrap של קבצי בסיס דרך `src/services/SharePointBootstrapService.js`.
- יצירת Document Libraries `siteDB` ו-`siteUsersDb` דרך דפדפן ב-`src/services/sharePointDocumentLibrariesSetup.ts`.
- טיפול בהרשאות `siteUsersDb` דרך `src/services/sharePointPermissionsSetup.ts`.
- ניהול מנהלים משלושה מקורות: TXT, Site Collection Admins, ו-Owners Group.
- גיבויים אמיתיים של קבצי TXT ל-`siteDB/siteAssets/Backups`.
- פריסת build ל-SharePoint דרך WebDAV/robocopy בסקריפטים `scripts/postbuild.js`, `scripts/init-sharepoint-site.js`, ו-`deploy.js`.

ה-Hub הנוכחי הוא מערכת נפרדת תחת `sitebuilder-hub`. הוא כן כולל Server Express, Mongo models, UI Dashboard, Registry, Jobs, Audit, Releases, Backups ו-Admins. אבל ברובו הוא CRUD ו-metadata מקומיים מול Mongo. הוא לא משתמש בלוגיקה האמיתית של Site Builder, לא קורא TXT אמיתי, לא מבצע digest, לא בודק Document Libraries אמיתיות, לא יודע לפרוס `dist`, לא יודע להריץ bootstrap אמיתי, ולא מסנכרן מנהלים מול Site Collection או Owners Group.

לכן הפער המרכזי הוא לא UI אלא שכבת שליטה: ה-Hub נראה כמו Control Center, אבל כרגע אינו מחובר למנגנון SharePoint האמיתי שעליו Site Builder חי. פעולות כמו deploy, backup, admin-sync ו-health מסומנות או נשמרות כמטא-דאטה, אך אינן מבצעות את הפעולה האמיתית ב-SharePoint.

חמשת הפערים הארכיטקטוניים הגדולים:

1. חסרה ב-Hub שכבת SharePoint אמיתית: request helper, digest, direct TXT GET/PUT, REST folder/list/file/admin APIs.
2. חסר path resolver זהה למקור: ה-Hub שומר `siteDB`/`siteUsersDb` כמחרוזות, אך המקור עובד עם נתיבים מלאים כמו `/sites/<siteCode>/siteDB/siteAssets`.
3. deploy/version ב-Hub הם metadata-only: worker משנה גרסה ב-Mongo ומסמן הצלחה בלי להעתיק build, בלי manifest, בלי bootstrap, ובלי אימות SharePoint.
4. backup/admin-sync ב-Hub הם metadata-only: אין קריאה/כתיבה לקבצי TXT, אין קריאת Site Collection Admins, ואין Owners Group אמיתי.
5. אין אסטרטגיית auth/session ל-SharePoint בצד שרת: המקור נשען על session דפדפן של SharePoint, בעוד Hub backend לא מחזיק cookie/OAuth/service account/On-Behalf-Of.

## 2. Original Site Builder architecture map

### Frontend framework

- Framework: React 19 + Vite 7.
- Entry:
  - `src/main.jsx`
  - `src/App.jsx`
- Router: `HashRouter` מתוך `react-router-dom`.
- Build hosting: Vite מוגדר ב-`vite.config.js` עם `base: './'`, כדי שקבצי JS/CSS ייטענו יחסית מתוך SharePoint Document Library.
- Providers ב-`src/main.jsx`:
  - `ConfigProvider`
  - `AuthProvider`
  - `NavigationProvider`
  - `EventsProvider`
  - `SiteContentProvider`
  - `OrgChartProvider`
  - `ThemeProvider`
  - `WidgetProvider`
  - `ExternalLinksProvider`

### Routing

הקובץ `src/App.jsx` מגדיר:

- `/` - עמוד הבית.
- `/org-chart` - עץ ארגוני.
- `/admin/sharepoint-setup` - מסך bootstrap/setup של SharePoint.
- `/admin/*` - אזור ניהול מוגן דרך `AdminRoute`.
- `*` - fallback לעמוד הבית.

`AdminRoute` משתמש ב-`useAuth()` וחוסם משתמש שאינו admin. בנוסף, `SharePointPermissionsSetupStatus` נטען בכל האפליקציה ומפעיל בדיקות/הכנות SharePoint כאשר נכנסים למסכי admin.

### Data loading flow

הזרימה המרכזית כיום היא:

1. `src/context/ConfigContext.jsx` מפעיל ב-production את `ensureSharePointBootstrapFiles()` מתוך `src/services/SharePointBootstrapService.js`.
2. לאחר מכן הוא קורא `ConfigService.loadConfig()` מתוך `src/services/ConfigService.js`.
3. `ConfigService` משתמש ב-`ConfigAdapter` כדי לטעון את `bihs_master_config_v1.txt`.
4. אם הקובץ חסר/ריק/לא תקין, נטענת ברירת מחדל מ-`src/config/AppSchema.js` ונשמרת חזרה.
5. contexts אחרים קוראים מתוך ה-master config:
   - `EventsContext` קורא `config.widgets.data.events`.
   - `NavigationContext` קורא `config.navigation.items`.
   - `SiteContentContext` קורא `config.content`.
   - `ThemeContext` קורא `config.theme` ו-`config.layout`.
   - `ExternalLinksContext` קורא `config.externalLinks`.
   - `OrgChartContext` קורא `config.content.orgChart`.
   - `WidgetContext` קורא חלק מהנתונים מה-master config, אבל polls/votes נטענים גם מ-`widgets_data.txt`.

קיימים עדיין services legacy שמסוגלים לקרוא קבצים מפוצלים:

- `src/services/EventsService.js`
- `src/services/NavigationService.js`
- `src/services/SiteContentService.js`
- `src/services/ThemeService.js`
- `src/services/WidgetService.js`
- `src/services/ExternalLinksService.js`
- `src/services/UsersService.js`

### Data writing flow

כתיבת רוב ההגדרות הניהוליות:

1. UI ניהולי משנה state ב-context.
2. context קורא ל-`saveConfigSection()` או פעולה דומה ב-`ConfigContext`.
3. `ConfigService.saveConfig()` שומר את כל master config.
4. `ConfigAdapter.save()` כותב ל-`bihs_master_config_v1.txt`.
5. הכתיבה בפועל עוברת דרך `upsertSharePointTextFile()` ב-`src/utils/sharepointUtils.js`.

כתיבות legacy/היברידיות:

- `UsersService.saveUsers()` כותב את `users_data.txt`.
- `WidgetService.saveWidgetConfig()` כותב את `widgets_data.txt`.
- `WidgetContext.savePollVote()` שומר הצבעות ל-`widgets_data.txt`.
- גיבויים נכתבים לתיקיות תחת `siteDB/siteAssets/Backups`.

### SharePoint hosting model

המודל בפועל:

- אתר SharePoint: `/sites/<siteCode>`.
- Document Library ראשית: `siteDB`.
- תיקיית app build: `/sites/<siteCode>/siteDB/dist`.
- קובץ כניסה: `/sites/<siteCode>/siteDB/dist/index.html`.
- assets נטענים יחסית בגלל `base: './'`.
- routes פנימיים מתנהלים דרך hash, לא דרך server routing.

קיימת גם ספריית bootstrap:

- ברירת מחדל: `/sites/<siteCode>/SiteAssets/sitebuilder-bootstrap/dist`.
- URL setup:

```text
https://<host>/sites/<siteCode>/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup
```

### SharePoint document libraries used

שתי הספריות המרכזיות:

- `siteDB` - אחסון build סופי, `siteAssets`, images, רוב TXT/JSON, backups.
- `siteUsersDb` - אחסון נתונים בעלי אופי משתמשי/שיתופי, ובברירת מחדל `widgets_data.txt`.

בנוסף:

- `SiteAssets/sitebuilder-bootstrap` - יעד bootstrap זמני עבור build שממנו מסך setup מעתיק ליעד הסופי.

### TXT/JSON storage model

הקבצים הם `.txt`, אבל התוכן הוא JSON. הנתיבים נגזרים ב-`src/config/sharepointPaths.js`:

- `siteDbRoot = /sites/<siteCode>/<siteDB>`
- `siteAssetsRoot = /sites/<siteCode>/<siteDB>/siteAssets`
- `usersDbRoot = /sites/<siteCode>/<siteUsersDb>` או ערך מלא מתוך `VITE_SP_USERS_DB_FOLDER`
- `widgets_data.txt` הולך ל-`siteUsersDb` אם `VITE_SP_WIDGETS_DB_TARGET=users`, וזה default.

### Bootstrap/deploy/init flow

הזרימה הנכונה:

1. `npm run build` יוצר `dist`.
2. `scripts/postbuild.js` רץ אוטומטית אחרי build.
3. אם `VITE_AUTO_DEPLOY=true`, `postbuild` יוצר `dist/sharepoint-deploy-manifest.json`.
4. `postbuild` מריץ `scripts/init-sharepoint-site.js --check-only`.
5. אם `siteDB` ו-`siteUsersDb` קיימות, הוא מריץ `--finalize-existing` ואז `deploy.js --mode final`.
6. אם הספריות חסרות, הוא עובר ל-`--bootstrap-mode` ואז `deploy.js --mode bootstrap`.
7. במצב bootstrap, המשתמש פותח את `#/admin/sharepoint-setup`, ושם הדפדפן יוצר ספריות/תיקיות/קבצי TXT ומעתיק את כל `dist` מה-bootstrap ליעד הסופי.

חשוב: `deploy.js` יכול למחוק ולסנכרן יעד `dist` דרך `robocopy /MIR`, ולכן לא הורץ בבדיקה.

### Admin management flow

יש שלושה מקורות:

- TXT admins: `users_data.txt` דרך `UsersService` ו-`txtAdminsService`.
- Site Collection Admins: SharePoint `siteusers` עם `IsSiteAdmin=true`, דרך `fetchSharePointAdmins()` ו-`sharePointSiteCollectionAdminsService.ts`.
- Owners Group: `associatedownergroup` ו-`sitegroups(...)/users`, דרך `sharePointOwnersService.ts`.

המסך המרכזי הוא `src/components/AdminSiteOwnersManagement.jsx`.

### Permissions flow

ההרשאות מטופלות בשני מישורים:

- Document Libraries readiness: `src/services/sharePointDocumentLibrariesSetup.ts`.
- הרשאות על `siteUsersDb`: `src/services/sharePointPermissionsSetup.ts`.

`SharePointPermissionsSetupStatus` מפעיל את שתי השכבות כאשר admin נכנס למסכי admin ב-production.

### Env configuration flow

קבצי env שולטים כמעט בכל הנתיבים:

- `VITE_SP_HOST` - host, למשל `portal.army.idf`.
- `VITE_SP_SITE_CODE` - קוד האתר תחת `/sites`.
- `VITE_SP_SITE_DB_FOLDER` - שם Document Library ראשית, default `siteDB`.
- `VITE_SP_USERS_DB_FOLDER` - שם או נתיב של users DB, default `siteUsersDb`.
- `VITE_SP_SITE_API_ROOT` - root ל-REST API, default `/sites/<siteCode>`.
- `VITE_SITE_BASE_URL` - base URL ל-assets/images ב-production.
- `VITE_SP_BOOTSTRAP_LIBRARY` - default `SiteAssets`.
- `VITE_SP_BOOTSTRAP_FOLDER` - default `sitebuilder-bootstrap`.
- `VITE_SP_SITE_ASSETS_FOLDER` - default `siteAssets`.
- `VITE_SP_IMAGES_FOLDER` - default `images`.
- `VITE_SP_WIDGETS_DB_TARGET` - `users` או `site`.
- `VITE_AUTO_DEPLOY` ו-`VITE_AUTO_DEPLOY_STRICT` - מפעילים postbuild deploy.

`scripts/sp-env.js` יודע לייצר `.env.production`, ולכן שינוי env דרך סקריפט זה הוא פעולה שמשנה קבצים ולא הורצה.

## 3. SharePoint integration deep dive

### Base URL derivation

`src/config/sharepointPaths.js` הוא מקור האמת המרכזי לנתיבים:

- `siteRoot = /sites/<siteCode>`
- `siteDbRoot = /sites/<siteCode>/<siteDB>`
- `usersDbRoot = /sites/<siteCode>/<siteUsersDb>` או הערך המלא של `VITE_SP_USERS_DB_FOLDER`
- `siteAssetsRoot = <siteDbRoot>/siteAssets`
- `imagesRoot = <siteDbRoot>/images`
- `siteBaseUrl = https://<host><siteDbRoot>/dist`
- `siteApiRoot = VITE_SP_SITE_API_ROOT || siteRoot`

`src/utils/resolveCurrentSharePointWebUrl.js` משמש בעיקר admin/owners operations. סדר ההחלטה:

1. `_spPageContextInfo.webAbsoluteUrl`
2. `VITE_SP_SITE_API_ROOT + VITE_SP_HOST`
3. `SHAREPOINT_PATHS.siteApiRoot/siteRoot`
4. ניתוח `window.location.pathname` עבור `/sites/*` או `/teams/*`
5. `window.location.origin`

`src/utils/assetUrl.js` משתמש ב-`VITE_SITE_BASE_URL` או ב-`SHAREPOINT_PATHS.siteBaseUrl`, וב-localhost מחזיר את origin המקומי כדי לא לשבור preview/dev.

### API root derivation

`src/utils/sharepointUtils.js` מגדיר:

- `RAW_SITE_API_ROOT = VITE_SP_SITE_API_ROOT || VITE_SP_SITE_ROOT || SHAREPOINT_PATHS.siteApiRoot`
- `resolveApiSiteRoot(scope)` שמנסה להשתמש ב-root מוגדר, או לגזור site root מנתיב server-relative.
- `extractSiteRootFromPath()` מזהה segments כמו `siteassets`, `shared documents`, `documents`, `style library`, `sitepages`, `site pages`, `lists`.

זה חשוב כי קובץ יכול להיות תחת Document Library, אבל `/_api/contextinfo` צריך לפגוע ב-web/site root הנכון.

### Request helper functions

הקובץ המרכזי:

- `src/utils/sharepointUtils.js`

פונקציות חשובות:

- `buildFileValueEndpoint(serverRelativeUrl)` - מחזירה URL ישיר לקובץ, לא REST `$value`.
- `ensureSharePointTextFileExists(...)` - מוודאת שקובץ TXT קיים, ויוצרת אם חסר.
- `upsertSharePointTextFile(...)` - כותבת/מעדכנת קובץ TXT.
- `getRequestDigest(scope)` - מקבלת ומטמנת digest.
- `createBackup(...)`
- `listSharePointBackups(...)`
- `listSharePointBackupFiles(...)`
- `deleteSharePointBackup(...)`
- `uploadImage(file, categoryFolder)`

הערה קריטית: עבור TXT, הקוד מעדיף direct file URL GET/PUT. REST משמש בעיקר כ-fallback ליצירת תיקיות או לקבצים בינאריים.

### GET patterns

דוגמאות בפועל:

- Direct TXT:

```text
GET /sites/<siteCode>/siteDB/siteAssets/bihs_master_config_v1.txt
GET /sites/<siteCode>/siteDB/siteAssets/users_data.txt
GET /sites/<siteCode>/siteUsersDb/widgets_data.txt
```

- Current user:

```text
GET /_api/web/currentuser
GET <webUrl>/_api/web/currentuser?$select=Id,Title,Email,LoginName,IsSiteAdmin
```

- Site collection admins:

```text
GET https://<host>/sites/<siteCode>/_api/web/siteusers?$filter=IsSiteAdmin eq true
GET /_api/web/siteusers?$filter=IsSiteAdmin eq true
GET /_api/site/rootweb/siteusers?$filter=IsSiteAdmin eq true
```

- Document Library:

```text
GET <siteRoot>/_api/web/lists/GetByTitle('<title>')?$select=Id,Title,BaseTemplate,DefaultViewUrl,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,OnQuickLaunch&$expand=RootFolder
```

- Folder:

```text
GET <siteRoot>/_api/web/GetFolderByServerRelativeUrl('<folder>')/Folders
GET <siteRoot>/_api/web/GetFolderByServerRelativeUrl('<folder>')/Files
GET <siteRoot>/_api/web/GetFolderByServerRelativeUrl('<folder>')/ListItemAllFields?$select=HasUniqueRoleAssignments
```

- Owners:

```text
GET <webUrl>/_api/web/associatedownergroup
GET <webUrl>/_api/web/sitegroups(<ownersGroupId>)/users?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType
```

### POST/MERGE/DELETE patterns

- Digest:

```text
POST <siteRoot>/_api/contextinfo
```

- יצירת folder:

```text
POST <siteRoot>/_api/web/folders
Body: { "__metadata": { "type": "SP.Folder" }, "ServerRelativeUrl": "<folder>" }
```

- יצירת Document Library:

```text
POST <siteRoot>/_api/web/lists
Body includes BaseTemplate: 101, Title, Description, OnQuickLaunch
```

- עדכון list/folder metadata:

```text
POST <siteRoot>/_api/web/lists/GetByTitle('<title>')
Headers: X-HTTP-Method: MERGE, IF-MATCH: *

POST <siteRoot>/_api/web/GetFolderByServerRelativeUrl('<root>')
Headers: X-HTTP-Method: MERGE, IF-MATCH: *
Body: { "__metadata": { "type": "SP.Folder" }, "WelcomePage": "Forms/AllItems.aspx" }
```

- העלאת קובץ דרך REST:

```text
POST <siteRoot>/_api/web/GetFolderByServerRelativeUrl('<folder>')/Files/add(url='<fileName>',overwrite=true)
```

- הגדרת Site Collection Admin:

```text
POST <webUrl>/_api/web/getuserbyid(<id>)
Headers: X-HTTP-Method: MERGE, IF-MATCH: *
Body: { "__metadata": { "type": "SP.User" }, "IsSiteAdmin": true|false }
```

- Owners Group:

```text
POST <webUrl>/_api/web/ensureuser
POST <webUrl>/_api/web/sitegroups(<ownersGroupId>)/users
POST <webUrl>/_api/web/sitegroups(<ownersGroupId>)/users/removebyid(<userId>)
```

- הרשאות `siteUsersDb`:

```text
POST .../ListItemAllFields/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)
POST .../roleassignments/addroleassignment(principalid=<membersGroupId>,roledefid=1073741827)
```

`1073741827` הוא role definition של Contribute.

- מחיקת backup folder:

```text
POST <siteRoot>/_api/web/GetFolderByServerRelativeUrl('<backupFolder>')
Headers: X-HTTP-Method: DELETE, IF-MATCH: *
```

### Digest handling

`getRequestDigest(scope)` ב-`src/utils/sharepointUtils.js`:

- מבצע `POST /_api/contextinfo`.
- שומר digest ב-`Map` לפי site root.
- TTL בערך 25 דקות.
- משמש ל-REST write operations.

TXT direct PUT אינו מוסיף `X-RequestDigest`. אם PUT נכשל ב-404 עקב תיקייה חסרה, הקוד משיג digest, יוצר folder hierarchy, ואז מנסה PUT שוב.

### File upload/download

- TXT download: direct `GET` לנתיב הקובץ.
- TXT upload/update: direct `PUT` לנתיב הקובץ.
- Image upload: REST `Files/add(...)` עם body כ-`ArrayBuffer`.
- Bootstrap setup copy: מסך `AdminSharePointSetupPage` קורא קבצים מ-bootstrap ומעלה אותם ל-final dist דרך `Files/add`.

### Folder creation

`ensureSharePointFolderHierarchy()` ב-`sharepointUtils.js` יוצר folders דרך:

```text
POST /_api/web/folders
```

מסך `AdminSharePointSetupPage` כולל גם helpers מקומיים ל-`ensureFolder`, `folderExists`, `fileExists`, ו-copy.

### Document Library creation

`src/services/sharePointDocumentLibrariesSetup.ts`:

- יוצר `siteDB` ו-`siteUsersDb` כ-Document Libraries עם `BaseTemplate: 101`.
- מוודא `DefaultViewUrl`.
- מגדיר `RootFolder.WelcomePage = Forms/AllItems.aspx`.
- מוודא `OnQuickLaunch`.
- בונה URL נוח לניווט לספרייה עם `RootFolder`.

### Navigation / DefaultViewUrl / Forms/AllItems.aspx

קיים טיפול מפורש ב-`Forms/AllItems.aspx`:

- קבוע `REQUIRED_WELCOME_PAGE = 'Forms/AllItems.aspx'`.
- אם ה-root folder של הספרייה לא מפנה לשם, הקוד מעדכן אותו דרך MERGE.
- המטרה: פתיחת Document Library מהדפדפן תגיע ל-view תקין ולא למיקום לא נוח או ריק.

### Error handling and logging

יש logging נקודתי בכמה שכבות:

- `src/utils/sharepointDebugLogger.js`
- `src/services/adminManagementLogger.ts`
- `src/services/sharePointOwnersLogger.ts`
- flags כמו:
  - `VITE_SP_VERBOSE_LOG`
  - `VITE_SP_PERMISSIONS_SETUP_LOGS`
  - `VITE_SP_ENABLE_OWNERS_MANAGEMENT_LOGS`
  - `VITE_SP_LOG_FETCH_ADMINS`
  - `VITE_SP_BOOTSTRAP_SETUP_LOGS`

ה-logging מסנן נתונים רגישים כמו digest/cookie/auth.

## 4. Original data model

| File | Location | Stores | Read by | Written by | Classification |
|---|---|---|---|---|---|
| `bihs_master_config_v1.txt` | `siteDB/siteAssets` | config קנוני מלא: meta, theme, layout, navigation, content, widgets, externalLinks, access | `ConfigAdapter`, `ConfigService`, `ConfigContext` | `ConfigService`, `ConfigAdapter`, bootstrap/factory reset | System config, נערך דרך admin UI |
| `users_data.txt` | `siteDB/siteAssets` | רשימת מנהלי מערכת מקומית/TXT | `UsersService`, `AuthContext`, `txtAdminsService` | `UsersService.saveUsers`, `AuthContext` אחרי sync, `txtAdminsService` | Admin/security data |
| `events_data.txt` | `siteDB/siteAssets` | legacy events config/list | `EventsService` | `EventsService.saveEvents`, bootstrap legacy | Legacy/user-editable content |
| `nav_data.txt` | `siteDB/siteAssets` | legacy navigation items | `NavigationService` | `NavigationService.saveNavigation`, bootstrap legacy | Legacy/user-editable content |
| `site_content_data.txt` | `siteDB/siteAssets` | legacy homepage/content/org chart content | `SiteContentService` | `SiteContentService.saveContent`, bootstrap legacy | Legacy/user-editable content |
| `theme_data.txt` | `siteDB/siteAssets` | legacy theme/layout data | `ThemeService` | `ThemeService.saveTheme`, bootstrap legacy | Legacy/user-editable design |
| `external_links_data.txt` | `siteDB/siteAssets` | legacy external links | `ExternalLinksService` | `ExternalLinksService.saveLinks`, bootstrap legacy | Legacy/user-editable content |
| `widgets_data.txt` | default `siteUsersDb`; can be `siteDB/siteAssets` if `VITE_SP_WIDGETS_DB_TARGET=site` | shared widget state, בעיקר polls/votes | `WidgetService`, `WidgetContext` | `WidgetService`, `WidgetContext.savePollVote` | User/shared runtime data |
| `sharepoint-deploy-manifest.json` | `dist` during build, then bootstrap/final dist | רשימת קבצי build לפריסה/העתקה | `AdminSharePointSetupPage` | `scripts/postbuild.js` | Deploy metadata |
| `.permissions-setup.json` | `siteUsersDb` folder | marker שהרשאות הוגדרו | `sharePointPermissionsSetup.ts` | `sharePointPermissionsSetup.ts` | System marker |
| `backup-*` folders | `siteDB/siteAssets/Backups` | עותקים של TXT files | `listSharePointBackups`, `listSharePointBackupFiles` | `createBackup`, `deleteSharePointBackup` | Backup data |
| images | `siteDB/images/<category>` | קבצי תמונה uploaded | `assetUrl`, UI content references | `uploadImage` | User media |

הערה חשובה: `users_data.txt` נמצא תחת `siteDB/siteAssets`, לא תחת `siteUsersDb`, לפי `SHAREPOINT_PATHS.usersFileServerRelativeUrl`. לעומת זאת `widgets_data.txt` נמצא בברירת מחדל תחת `siteUsersDb`.

## 5. Original admin/permissions model

### Local managers/admins

מנהלים מקומיים נשמרים ב-`users_data.txt`. הקוד:

- `src/services/UsersService.js`
- `src/services/txtAdminsService.ts`
- `src/services/adminSourcesSyncService.ts`
- `src/context/AuthContext.jsx`

`UsersService.getUsers()` קורא את הקובץ. אם הוא חסר ב-production, השירות מנסה ליצור sample/default admins ברקע. `AuthContext` טוען את הרשימה ומשווה מול המשתמש הנוכחי.

### SharePoint Site Collection Admins

`src/utils/sharepointAdmins.js` מבצע:

```text
GET https://<host>/sites/<siteCode>/_api/web/siteusers?$filter=IsSiteAdmin eq true
```

ואז fallback:

```text
GET /_api/web/siteusers?$filter=IsSiteAdmin eq true
GET /_api/site/rootweb/siteusers?$filter=IsSiteAdmin eq true
```

`src/services/sharePointSiteCollectionAdminsService.ts` מוסיף יכולות כתיבה:

- `ensureUserByEmail()`
- `addSiteCollectionAdminByEmail()`
- `addSiteCollectionAdminByPersonalNumber()`
- `removeSiteCollectionAdmin()`
- `setSiteAdminFlag()` דרך MERGE ל-`getuserbyid`.

### Owners Group

`src/services/sharePointOwnersService.ts`:

- מאתר Owners Group דרך `/_api/web/associatedownergroup`.
- fallback ל-`VITE_SP_ASSOCIATED_OWNERS_GROUP_ID`.
- קורא משתמשים דרך `/_api/web/sitegroups(<id>)/users`.
- מוסיף דרך `/_api/web/sitegroups(<id>)/users`.
- מסיר דרך `/_api/web/sitegroups(<id>)/users/removebyid(<userId>)`.

### Personal numbers and emails

המרה קיימת בעיקר ב:

- `src/services/sharePointSiteCollectionAdminsService.ts`
- `src/services/adminSourcesSyncService.ts`
- `src/services/txtAdminsService.ts`

דפוסים חשובים:

- קלט כמו `1234567` או `s1234567` מנורמל ל-`s1234567@army.idf.il`.
- personal number נגזר מ-`LoginName` או email כאשר אפשר.
- dedup נעשה לפי login/personal/email/name.

### What works

- זיהוי admin מקומי מתוך TXT.
- סנכרון Site Collection Admins לתוך TXT.
- קריאת Owners Group.
- הוספה/הסרה של Site Collection Admins.
- הוספה/הסרה של Owners Group.
- מניעת הסרה עצמית/הסרת admin אחרון במסך הניהול.

### Fragile areas

- `AuthContext.trySharePointLogin()` קורא יחסית `/_api/web/currentuser`; במקרים שבהם האפליקציה נטענת מתוך נתיב שאינו web root צפוי, זה רגיש.
- Site Collection Admin fetch משתמש ב-absolute endpoint לפי `SHAREPOINT_PATHS.siteRoot`, ואז fallbacks יחסיים. זה טוב, אבל תלוי ב-host/siteCode נכונים.
- direct TXT PUT תלוי בכך ש-SharePoint מאפשר PUT ישיר לקובץ עם session נוכחי.
- sync של SharePoint admins לתוך TXT משנה state מקומי ויכול להסתיר פערים אם אינו מתועד היטב.
- Owners Group fallback ל-env ID דורש תחזוקה ידנית.

## 6. Original deploy/bootstrap model

### Build output

`npm run build` מפעיל:

```text
vite build
```

ואז `postbuild`:

```text
node scripts/postbuild.js
```

`vite.config.js` משתמש ב-`base: './'`, ולכן ה-build מתאים לאחסון בתיקיית SharePoint.

### dist copy/upload

`deploy.js` מעתיק את `dist` ל-SharePoint דרך WebDAV:

- final mode:

```text
\\<host>@SSL\DavWWWRoot\sites\<siteCode>\siteDB\dist
```

- bootstrap mode:

```text
\\<host>@SSL\DavWWWRoot\sites\<siteCode>\<bootstrapLibrary>\<bootstrapFolder>\dist
```

הכלי משתמש ב-`robocopy`. ברירת המחדל כוללת ניקוי/סנכרון יעד, ולכן זו פעולה מסוכנת שאסור להריץ באודיט.

### Bootstrap setup

אם `siteDB` או `siteUsersDb` לא קיימות:

1. `postbuild` עובר ל-bootstrap mode.
2. build מועלה ל-`SiteAssets/sitebuilder-bootstrap/dist`.
3. המשתמש פותח `#/admin/sharepoint-setup`.
4. `src/pages/AdminSharePointSetupPage.jsx` רץ בדפדפן עם session SharePoint של המשתמש.
5. הוא יוצר ספריות, תיקיות, TXT files, ומעתיק את כל `dist` מה-bootstrap ל-`siteDB/dist`.

### siteDB/siteUsersDb creation

שתי שכבות יכולות לטפל בזה:

- `src/services/sharePointDocumentLibrariesSetup.ts` בזמן runtime admin.
- `src/pages/AdminSharePointSetupPage.jsx` בזמן bootstrap setup.

שתיהן יוצרות Document Libraries ולא רק folders.

### Manifest

`scripts/postbuild.js` יוצר:

```text
dist/sharepoint-deploy-manifest.json
```

ה-manifest מכיל רשימת קבצים ב-`dist`. `AdminSharePointSetupPage` מנסה לטעון אותו מה-bootstrap. אם אין manifest, הוא מסוגל לגלות קבצים רקורסיבית דרך SharePoint REST. המסך כולל preflight שמוודא source לפני נגיעה ב-final dist.

### What broke recently and why

לא הורץ שחזור של התקלה בפועל, ולכן אין קביעה על אירוע ספציפי בזמן אמת. מהקוד ניתן לזהות את נקודות השבירה הרלוונטיות:

- אם `VITE_AUTO_DEPLOY=true`, build רגיל אינו רק build; הוא עלול להפעיל deploy ל-SharePoint.
- אם `siteDB`/`siteUsersDb` חסרות, ה-flow חייב לעבור דרך bootstrap. ניסיון לדלג ישירות ל-final deploy ייכשל.
- אם bootstrap dist חסר manifest וגם recursive discovery נכשל, final copy לא יקרה.
- אם ה-Hub או כלי חיצוני מניחים URL כמו `/sites/<siteCode>/app`, הם יפתחו יעד לא נכון; היעד האמיתי הוא `/siteDB/dist/index.html`.
- אם `VITE_SP_USERS_DB_FOLDER` הוא נתיב מלא במקום שם ספרייה, צריך להשתמש באותו resolver של המקור. מחרוזת פשוטה ב-Hub אינה מספיקה.

### Correct working flow

ה-flow הנכון צריך להישאר:

1. build מקומי.
2. יצירת manifest.
3. בדיקת קיום Document Libraries.
4. אם קיימות: finalize + deploy final.
5. אם חסרות: deploy bootstrap בלבד.
6. setup בדפדפן עם session SharePoint.
7. preflight לפני copy ל-final.
8. אימות `index.html`, `assets`, TXT files והרשאות.

## 7. Hub current implementation audit

### What it implements

ה-Hub הוא monorepo קטן תחת `sitebuilder-hub`:

- `sitebuilder-hub/server` - Express + Mongoose + Zod.
- `sitebuilder-hub/client` - React + Vite + Tailwind.
- MongoDB נשמר דרך models.
- UI מציג dashboard, sites, releases, backups, admins, jobs.

`sitebuilder-hub/README.md` מציין במפורש שהשלב הנוכחי הוא ללא אוטומציות SharePoint אמיתיות.

### API endpoints

`sitebuilder-hub/server/src/app.ts`:

- `GET /health/live`
- `GET /health/ready`
- `GET /api/health`
- `/api/auth`
- `/api/sites`
- `/api/releases`
- `/api/backups`
- `/api/version`
- `/api/jobs`
- `/api/audit`

Routes מרכזיים:

- `server/src/routes/sites.routes.ts`
- `server/src/routes/releases.routes.ts`
- `server/src/routes/backups.routes.ts`
- `server/src/routes/jobs.routes.ts`
- `server/src/routes/audit.routes.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/routes/version.routes.ts`

### Mongo models

- `Site`
- `Release`
- `Job`
- `SiteBackup`
- `SiteAdminSnapshot`
- `SiteVersionDeployment`
- `AuditLog`

המודלים מכילים fields טובים למטא-דאטה, אך לא מחוברים למקור אמת ב-SharePoint.

### Pages

- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/pages/ReleasesPage.tsx`
- `client/src/pages/BackupsPage.tsx`
- `client/src/pages/AdminsPage.tsx`
- `client/src/pages/JobsPage.tsx`

### Local CRUD only

פעולות שהן מקומיות בלבד:

- Site registry CRUD דרך `sites.service.ts`.
- Manual health check דרך `manualHealthCheck()`.
- Release creation/listing.
- Queue deploy job.
- Queue backup job.
- Queue admin sync job.
- Add/remove admins בתוך Mongo arrays.
- Audit log.

### Not connected to SharePoint

לא נמצאה שכבה ב-Hub שמבצעת:

- `/_api/contextinfo`
- `X-RequestDigest`
- direct TXT GET/PUT
- `GetByTitle`
- `GetFolderByServerRelativeUrl`
- `Files/add`
- WebDAV copy
- `ensureuser`
- `siteusers?$filter=IsSiteAdmin eq true`
- `associatedownergroup`
- Owners group add/remove
- permission break inheritance
- creation of Document Libraries

### Wrong assumptions compared to original

- `SiteFormModal.tsx` מגדיר default `finalAppUrl` כ-`https://portal.army.idf/sites/<code>/app`, אבל המקור נפרס ל-`/sites/<code>/siteDB/dist/index.html`.
- `siteDbLibrary` ו-`usersDbLibrary` הם plain strings, לא server-relative roots.
- backup worker מייצר `storagePath` כמו `/sites/<code>/siteAssets/Backups/<backupId>`, אבל המקור משתמש ב-`/sites/<code>/siteDB/siteAssets/Backups/...`.
- deploy worker מסמן `sharePointStatus.deployStatus='succeeded'` בלי deploy אמיתי.
- admin sync worker רק מצלם arrays מתוך Mongo, לא קורא SharePoint.
- health checklist הוא manual UI, לא health check אמיתי.
- client API לא מוסיף `x-api-key` או `x-personal-number`; אם `AUTH_ENABLED=true`, נדרש פתרון auth מלא.

## 8. Gap analysis: Original Site Builder vs Hub

| Capability | Original Site Builder has it? | Hub has it? | Gap | Required action |
|---|---|---|---|---|
| SharePoint request helper | כן, `sharepointUtils.js` | לא | אין helper, אין resolver, אין credentials | לבנות/לחלץ shared SharePoint client |
| Digest handling | כן, `getRequestDigest()` | לא | Hub לא יכול לבצע REST writes | להוסיף digest strategy לפי browser/backend auth |
| siteDB/siteUsersDb path resolution | כן, `sharepointPaths.js` | חלקי מאוד | strings במקום paths מלאים | לחלץ path resolver ולחייב אותו ב-Hub |
| TXT file read/write | כן | לא | אין קריאת/כתיבת קבצים אמיתיים | להוסיף read-only תחילה ואז write עם approvals |
| Document Library handling | כן | לא | אין `GetByTitle`, create list, WelcomePage | לשלב library readiness service |
| Bootstrap deploy | כן | לא | Hub לא מכיר bootstrap two-phase flow | למדל bootstrap job אמיתי עם preflight |
| Full dist copy | כן, WebDAV ו-browser copy | לא | deploy job לא מעתיק קבצים | להוסיף artifact + copy engine |
| Admin sync | כן | metadata-only | Hub מסנכרן arrays ממונגו | לקרוא TXT, Site Collection, Owners Group |
| Permissions | כן | לא | אין break inheritance/role assignment | להוסיף health/read-only ואז write workflow |
| Health checks | חלקית, runtime/admin | manual בלבד | אין SharePoint probing אמיתי | לבנות health service שמריץ GET אמיתי |
| Version tracking | footer/app version + scripts | metadata-only | אין artifact/version verification | לקשור release ל-build manifest ול-final dist |
| Backup tracking | כן, גיבוי אמיתי TXT | metadata-only | worker יוצר SiteBackup fake | להשתמש ב-`createBackup` logic או backend adapter |
| Jobs | לא כמרכז, אבל פעולות קיימות | כן | jobs קיימים בלי operations אמיתיות | להפוך jobs לעוטפות פעולות אמיתיות |
| Audit logs | logging מקומי, לא audit מרכזי | כן | audit לא מחובר לתוצאות SharePoint | audit לכל preflight/write/result |
| Central registry | לא | כן | registry לא מאומת מול SharePoint | להעשיר registry ב-derived paths ומצב אמיתי |
| Multi-site operations | לא | חלקית metadata | אין loop אמיתי על SharePoint sites | להוסיף credential/session strategy ו-safe fanout |
| Create new site | bootstrap יוצר libraries באתר קיים | לא באמת | Hub לא יוצר SharePoint site או libraries | להגדיר scope: site קיים מול יצירת site חדשה |
| Update existing site | כן דרך deploy scripts | metadata-only | Hub משנה Mongo בלבד | ליישם controlled deploy/update |
| Production server/API | לא נדרש במקור | בסיס קיים | חסרים auth, hosting, secrets, network, SP auth | להקשיח production model |

## 9. Why the Hub currently cannot deliver the desired product

ה-Hub הנוכחי אינו יכול להיות Control Center אמיתי כי הוא לא מחובר לשכבה שבה Site Builder באמת חי: SharePoint.

דוגמאות ישירות:

- Deploy ב-Hub לא מעלה `dist` ולא מפעיל WebDAV/REST copy. הוא רק משנה `currentVersion` ב-Mongo.
- Backup ב-Hub לא קורא אף TXT ולא כותב ל-`siteDB/siteAssets/Backups`. הוא יוצר metadata עם size משוער.
- Admin Sync ב-Hub לא קורא `users_data.txt`, לא קורא `siteusers`, ולא קורא Owners Group. הוא משווה arrays שכבר קיימים ב-Mongo.
- Health Check ב-Hub הוא checkbox/manual status, לא בדיקת SharePoint.
- Registry ב-Hub לא יודע אם URL, libraries, TXT files, permissions או dist קיימים בפועל.
- אין auth ל-SharePoint. גם אם יתווסף fetch ב-backend, אין לו cookie/session של המשתמש שנמצא ב-SharePoint.

לכן כרגע ה-Hub הוא registry/dashboard עם job metadata. הוא יכול להיות התחלה טובה לניהול מרכזי, אבל הוא עדיין לא מנהל אתרי Site Builder קיימים ב-SharePoint.

## 10. Required architecture for the correct Hub

### What should stay in the original Site Builder

- Runtime SPA שמשרת משתמשי קצה מתוך SharePoint.
- Admin UI המקומי של האתר לניהול תוכן.
- Browser-session based operations שחייבות הרשאות SharePoint של המשתמש:
  - bootstrap setup בדפדפן.
  - owners/site admins כאשר אין backend credential מאושר.
  - פעולות שמסתמכות על cookies של SharePoint.

### What should move into shared modules

צריך לחלץ קוד טהור שאינו תלוי React:

- path resolver מ-`src/config/sharepointPaths.js`.
- TXT file definitions.
- config schema/migration helpers מ-`src/config/AppSchema.js`.
- admin normalization/diff מ-`adminSourcesSyncService.ts`.
- URL/base path helpers.
- deploy manifest helpers.

### What should be reused by the Hub

ה-Hub צריך להשתמש באותם חוקים בדיוק:

- איפה נמצא `bihs_master_config_v1.txt`.
- איפה נמצא `users_data.txt`.
- איפה נמצא `widgets_data.txt`.
- איך נגזר final app URL.
- איך נגזרים bootstrap URLs.
- אילו קבצים חייבים להתקיים.
- איך מודדים health.

### What should become backend Node services

רק אם קיימת אסטרטגיית auth מאושרת ל-SharePoint:

- read-only health checks.
- read-only inventory discovery.
- release artifact verification.
- backup metadata and actual backup creation.
- controlled deploy/update.
- audit and job orchestration.

אם אין auth server-side, backend לא יכול לבצע כתיבות SharePoint בצורה אמינה. במקרה כזה ה-backend צריך לנהל jobs/approvals/audit, והפעולה עצמה צריכה לרוץ בדפדפן של admin המחובר ל-SharePoint או דרך worker בסביבה עם הרשאות מוגדרות.

### What should stay browser-based because SharePoint auth/session is needed

- bootstrap setup של אתר חדש/חסר.
- add/remove Site Collection Admins כאשר משתמשים בהרשאות admin של המשתמש.
- Owners Group operations.
- permission setup על `siteUsersDb` אם אין service account.

### How the Hub should safely execute SharePoint operations

כל פעולה צריכה להיות בנויה כך:

1. Resolve canonical paths.
2. Read-only preflight.
3. Dry-run summary.
4. Approval.
5. Execute with idempotency key.
6. Write audit logs.
7. Verify final state.
8. Store artifact/results.
9. Provide rollback/restore path where relevant.

אין לסמן job כ-success לפני אימות SharePoint אמיתי.

## 11. Proposed shared package / shared core

מומלץ ליצור shared packages, אבל רק אחרי ייצוב ותיעוד המקור.

### `packages/sharepoint-core`

צריך להכיל:

- `resolveSharePointPaths(config)`
- `resolveCurrentWebUrl(...)`
- `buildSiteApiUrl(...)`
- `getRequestDigest(...)`
- `getJsonTextFile(...)`
- `putJsonTextFile(...)`
- `ensureFolderHierarchy(...)`
- `listFolderFiles(...)`
- `uploadFile(...)`
- `deleteFolder(...)`

צריך לתמוך בשני adapters:

- `browserFetchAdapter` עם `credentials: include`.
- `serverFetchAdapter` רק עם auth strategy מפורשת.

### `packages/sitebuilder-core`

צריך להכיל:

- file definitions:
  - master config
  - users
  - events
  - nav
  - content
  - theme
  - widgets
  - external links
- schema validation/migration מתוך `AppSchema.js`.
- default payload factories מתוך `SharePointBootstrapService.js`.
- health rules.
- admin source normalization/diff.

### `packages/deploy-core`

אופציונלי, אך מומלץ:

- manifest generation/parsing.
- dist file inventory.
- target path calculation.
- copy plan.
- preflight result schema.
- final verification schema.

### Extraction rules

- לא לחלץ React components.
- לא לערבב UI עם SharePoint IO.
- לא לשנות את המקור לפני שיש tests סביב path resolution וקבצי TXT.
- shared core חייב להיות נבדק מול דוגמאות env אמיתיות.

## 12. Correct Hub roadmap

### Phase 0: Stabilize and document original Site Builder architecture

- Goal: להפוך את הארכיטקטורה הקיימת למקור אמת כתוב ובדוק.
- Files affected: docs בלבד בהתחלה; בהמשך tests סביב `sharepointPaths`, `AppSchema`, `SharePointBootstrapService`.
- Reuse: כל הקוד המקורי, ללא שינוי התנהגות.
- Backend work: אין.
- Frontend work: אין.
- Risks: תיעוד לא תואם קוד בפועל.
- Acceptance criteria:
  - יש מסמך path/data/deploy/admin מעודכן.
  - יש רשימת קבצי TXT וקשרים.
  - ברור מתי פעולה כותבת ל-SharePoint.

### Phase 1: Rebuild/fix Hub registry according to real Site Builder data model

- Goal: Registry שמבין את הנתיבים האמיתיים.
- Files affected:
  - `sitebuilder-hub/server/src/models/Site.ts`
  - `sitebuilder-hub/server/src/validators/site.schema.ts`
  - `sitebuilder-hub/client/src/components/SiteFormModal.tsx`
  - shared path resolver חדש.
- Reuse: `sharepointPaths.js` rules.
- Backend work:
  - לשמור `siteCode`, `host`, `siteRoot`, `siteDbRoot`, `usersDbRoot`, `siteAssetsRoot`, `finalDistRoot`, `finalAppUrl`.
  - לחשב paths, לא להסתמך על input חופשי בלבד.
- Frontend work:
  - להציג final URL נכון.
  - להציג derived paths.
- Risks: שבירת נתונים קיימים ב-Mongo.
- Acceptance criteria:
  - אתר חדש ב-Hub מקבל URL `/siteDB/dist/index.html`.
  - `widgets_data.txt` path מחושב לפי `VITE_SP_WIDGETS_DB_TARGET`.
  - אין default `/app`.

### Phase 2: Read-only SharePoint health checks using real SharePoint logic

- Goal: health checks אמיתיים ללא כתיבה.
- Files affected:
  - `server/src/services/sites.service.ts`
  - service חדש `sharepointHealth.service.ts`
  - `client/src/pages/SiteDetailsPage.tsx`
  - `client/src/components/HealthChecklist.tsx`
- Reuse:
  - GET patterns מ-`sharepointUtils.js`.
  - Document Library validation rules מ-`sharePointDocumentLibrariesSetup.ts`.
- Backend work:
  - רק אם יש auth ל-SharePoint.
  - אחרת לבנות browser-based health runner.
- Frontend work:
  - כפתור "Run read-only check".
  - הצגת raw evidence לכל check.
- Risks: CORS/session/server auth.
- Acceptance criteria:
  - `siteDB`/`siteUsersDb` נבדקים מול SharePoint.
  - `dist/index.html`, `assets`, TXT files נבדקים בפועל.
  - אין כתיבות.

### Phase 3: Multi-site admin visibility

- Goal: צפייה מרכזית במנהלים מכל המקורות.
- Files affected:
  - `server/src/services/admins.service.ts`
  - `client/src/pages/AdminsPage.tsx`
  - shared admin normalization.
- Reuse:
  - `fetchSharePointAdmins`
  - `sharePointOwnersService`
  - `txtAdminsService`
  - `adminSourcesSyncService`
- Backend work:
  - read-only source collectors.
  - snapshots עם evidence.
- Frontend work:
  - diff אמיתי בין TXT/Site Collection/Owners.
- Risks: הרשאות קריאה שונות בין sites.
- Acceptance criteria:
  - Hub מציג admin sources שנקראו מ-SharePoint או מסמן בבירור "not accessible".
  - אין add/remove בשלב זה.

### Phase 4: Backup metadata and read-only backup planning

- Goal: לתכנן גיבוי לפי קבצי המקור האמיתיים.
- Files affected:
  - `server/src/services/backups.service.ts`
  - `server/src/models/SiteBackup.ts`
  - `client/src/pages/BackupsPage.tsx`
- Reuse:
  - `createBackup` file list logic, בלי כתיבה בהתחלה.
  - `listSharePointBackups`.
- Backend work:
  - backup plan: source files, existence, sizes.
  - list existing backups read-only.
- Frontend work:
  - show backup plan before execution.
- Risks: קבצים חסרים/legacy hybrid.
- Acceptance criteria:
  - backup plan מכיל את כל TXT files הנכונים.
  - backup path הוא `siteDB/siteAssets/Backups`, לא `siteAssets/Backups` ישיר.

### Phase 5: Jobs + audit based on real operations

- Goal: jobs ישקפו פעולות אמיתיות או preflight אמיתי.
- Files affected:
  - `server/src/services/jobs.worker.ts`
  - `server/src/services/audit.service.ts`
  - job payload schemas.
- Reuse:
  - operation result schemas מה-shared core.
- Backend work:
  - job states: queued, preflight, awaiting-approval, running, verifying, succeeded, failed.
  - audit לכל request/response חשוב.
- Frontend work:
  - job evidence/log detail page.
- Risks: סימון false success.
- Acceptance criteria:
  - אי אפשר לסמן deploy/backup/admin-sync success בלי evidence.
  - כל job מכיל target paths ו-operation result.

### Phase 6: Version management

- Goal: ניהול גרסאות מבוסס artifacts ולא רק string.
- Files affected:
  - `server/src/models/Release.ts`
  - `server/src/models/SiteVersionDeployment.ts`
  - release UI.
- Reuse:
  - manifest generation/parsing.
  - app version source מ-`package.json`/footer/build metadata.
- Backend work:
  - release artifact registry.
  - artifact checksum/file list.
- Frontend work:
  - show sites behind/latest.
- Risks: גרסה ב-Mongo לא משקפת SharePoint dist.
- Acceptance criteria:
  - release כולל manifest.
  - site version נקבעת מאימות build ב-SharePoint, לא רק Mongo.

### Phase 7: Controlled deploy/update

- Goal: deploy אמיתי לאתרים קיימים עם preflight ואישור.
- Files affected:
  - deploy service חדש.
  - `jobs.worker.ts`
  - `releases.service.ts`
  - UI approval flow.
- Reuse:
  - `deploy.js` concepts.
  - `postbuild.js` manifest.
  - `AdminSharePointSetupPage` copy/preflight logic.
- Backend work:
  - אם WebDAV זמין בשרת: controlled copy.
  - אם לא: browser/session based deploy runner.
- Frontend work:
  - dry-run diff.
  - approve deploy.
  - verify final.
- Risks: מחיקת dist, חוסר rollback, הרשאות.
- Acceptance criteria:
  - deploy לא מוחק יעד לפני preflight.
  - ניתן לראות אילו קבצים יוחלפו.
  - final `index.html` ו-assets מאומתים.

### Phase 8: Create new site from Hub

- Goal: יצירת Site Builder site מנוהל חדש.
- Files affected:
  - new-site workflow.
  - SharePoint provisioning service.
  - setup runner.
- Reuse:
  - `sharePointDocumentLibrariesSetup.ts`
  - `sharePointPermissionsSetup.ts`
  - `SharePointBootstrapService.js`
  - `AdminSharePointSetupPage.jsx`
- Backend work:
  - להחליט האם Hub יוצר SharePoint site collection/subsite או רק מכין Site Builder בתוך site קיים.
  - approvals.
  - audit.
- Frontend work:
  - wizard עם siteCode/env/owners.
- Risks: הרשאות יצירת אתרים, naming, collision, rollback.
- Acceptance criteria:
  - אתר חדש מגיע ל-final URL עובד.
  - `siteDB`, `siteUsersDb`, TXT, permissions ו-dist מאומתים.
  - registry מתעד את כל הנתיבים.

## 13. Production readiness requirements

לפני production ל-Hub צריך:

- Node server hosting יציב בתוך הרשת הרלוונטית.
- Mongo persistence עם backup/restore.
- auth model ברור:
  - API key אינו מספיק למוצר ניהולי.
  - personal number header אינו auth אמיתי ללא identity provider.
- SharePoint credential/session strategy:
  - browser-session runner, או
  - service account/certificate/OBO מאושר, או
  - worker שרץ בסביבה מורשית.
- CORS/internal server URL מוגדר.
- secret management עבור env.
- audit logging immutable מספיק לפעולות ניהול.
- backup storage אמיתי, לא metadata בלבד.
- version artifacts עם checksum/manifest.
- safe write approvals לכל פעולה כותבת.
- rollback strategy ל-deploy ול-config.
- monitoring לשרת, jobs, Mongo, ושגיאות SharePoint.
- closed network compatibility:
  - אין תלות ב-CDN חיצוני.
  - package/artifact source פנימי.
  - SharePoint endpoints זמינים מהסביבה שבה ה-Hub רץ.
- הרשאות least privilege.
- rate limits ו-CSRF/CORS הולמים.
- הפרדה בין read-only operations לבין write operations.

## 14. File-by-file findings

| Path | Purpose | Important functions/classes | Hub relevance | Recommendation |
|---|---|---|---|---|
| `package.json` | scripts ותלויות של המקור | `build`, `postbuild`, `lint`, `test` | מראה ש-build יכול לגרור postbuild | לא להריץ build באודיט; לתעד flow |
| `vite.config.js` | Vite config | `base: './'` | קריטי לאחסון SharePoint | לשמר כלל זה בכל artifact |
| `src/main.jsx` | Provider tree | providers | מראה runtime flow | לא לחלץ, אבל לתעד |
| `src/App.jsx` | routes/admin guard | `AdminRoute`, `SharePointPermissionsSetupStatus` | Hub צריך להבין ש-admin route מפעיל setup | לתעד side effects |
| `src/config/sharepointPaths.js` | נתיבי SharePoint | `SHAREPOINT_PATHS`, `resolveFilePath` | חייב להיות shared | לחלץ ל-core |
| `src/config/sharepoint.config.js` | mock/prod config | `SHAREPOINT_CONFIG` | חשוב ל-dev vs prod | לשמר הפרדה |
| `src/config/AppSchema.js` | schema קנוני | `DEFAULT_CONFIG_V1`, `migrateLegacyToV1`, `validateAndNormalize` | Hub צריך להבין data model | לחלץ schema helpers |
| `src/context/ConfigContext.jsx` | טעינת config | `ConfigProvider`, `saveConfigSection` | מראה master config runtime | לא לשכפל ב-Hub |
| `src/services/ConfigAdapter.js` | I/O master config | `load`, `save` | תבנית TXT read/write | לחלץ adapter logic |
| `src/services/ConfigService.js` | config service | `loadConfig`, `saveConfig` | schema/migration | לחלץ validation/migration |
| `src/services/SharePointBootstrapService.js` | default TXT bootstrap | `buildBootstrapFileDefinitions`, `ensureSharePointBootstrapFiles`, `overwriteSharePointBootstrapFiles` | Hub חייב להשתמש באותן ברירות מחדל | לחלץ file definitions |
| `src/utils/sharepointUtils.js` | SharePoint helper מרכזי | `getRequestDigest`, `upsertSharePointTextFile`, `createBackup`, `uploadImage` | הבסיס לשכבת Hub אמיתית | לחלץ/להפריד browser/server adapters |
| `src/utils/sharepointAdmins.js` | קריאת Site Collection Admins | `fetchSharePointAdmins` | צריך ל-Hub admin visibility | reuse עם adapter |
| `src/utils/resolveCurrentSharePointWebUrl.js` | זיהוי web URL | `resolveCurrentSharePointWebUrl` | חשוב לפעולות browser session | לחלץ |
| `src/utils/assetUrl.js` | image/base URL | `getSiteBaseUrl`, `resolveSiteImageUrl` | Hub צריך להציג URLs נכונים | לחלץ rules |
| `src/context/AuthContext.jsx` | auth/admin detection | `trySharePointLogin`, admin merge, `ensureRecentBackup` | מראה איך admin נקבע בפועל | לתעד ולחלץ normalization בלבד |
| `src/services/UsersService.js` | TXT admins | `getUsers`, `saveUsers` | Hub admin source TXT | reuse logic |
| `src/services/txtAdminsService.ts` | פעולות TXT admins | `listTxtAdmins`, `addTxtAdminFromSharePointUser`, `removeTxtAdmin`, `syncSiteCollectionAdminsToTxtAdmins` | חשוב ל-Hub Phase 3 | לחלץ לאחר tests |
| `src/services/adminSourcesSyncService.ts` | normalization/diff | admin normalize/merge helpers | מתאים ל-shared core | לחלץ |
| `src/services/sharePointSiteCollectionAdminsService.ts` | add/remove site admins | `ensureUserByEmail`, `setSiteAdminFlag`, `listSiteCollectionAdmins` | Hub write ops עתידיים | להשאיר browser-based עד auth strategy |
| `src/services/sharePointOwnersService.ts` | Owners Group ops | `getAssociatedOwnersGroup`, `getOwnersGroupUsers`, add/remove | Hub admin management | להשאיר browser-based או adapter |
| `src/services/sharePointOwnersGroupService.ts` | wrapper UI-friendly | owners operations wrapper | עוזר ל-Hub UI semantics | לחלץ service interface |
| `src/components/AdminSiteOwnersManagement.jsx` | UI לניהול מקורות admin | refresh/add/remove/sync | מקור דרישות Hub | לא לחלץ UI, כן ללמוד workflow |
| `src/services/sharePointDocumentLibrariesSetup.ts` | יצירת/בדיקת libraries | `ensureSharePointDocumentLibrariesReady`, `GetByTitle`, `BaseTemplate:101` | חובה ל-health/bootstrap | לחלץ read-only validators |
| `src/services/sharePointPermissionsSetup.ts` | הרשאות users DB | `ensureUsersDbFolderPermissionsReady`, `breakroleinheritance`, `roleassignments` | חובה ל-health/repair | כתיבה רק עם approval |
| `src/components/SharePointPermissionsSetupStatus.jsx` | runtime admin setup status | auto setup on admin route | side effect חשוב | Hub צריך להימנע מהפתעות כאלה |
| `src/pages/AdminSharePointSetupPage.jsx` | bootstrap browser setup | `runSetup`, preflight, `Files/add`, manifest copy | מודל create/setup נכון | reuse workflow as reference |
| `src/components/AdminBackupManagement.jsx` | UI גיבויים | calls backup utils | Hub backup צריך להיות אמיתי כמו זה | reuse service behavior |
| `scripts/sp-env.js` | env resolver/scripts | `resolveConfig`, `writeEnvProduction`, fileMap | מקור אמת deploy paths | לחלץ deploy config |
| `scripts/init-sharepoint-site.js` | WebDAV init | `check-only`, `finalize-existing`, `bootstrap-mode` | מודל init אמיתי | לא להריץ בלי אישור |
| `scripts/postbuild.js` | postbuild deploy orchestration | manifest, mode decision | מסוכן אם auto deploy true | לתעד/להפריד build מ-deploy |
| `deploy.js` | WebDAV copy | robocopy final/bootstrap | deploy אמיתי | לעטוף ב-dry-run/approval |
| `sitebuilder-hub/README.md` | Hub docs | MVP notes | מציין שאין automations SP בשלב זה | לעדכן אחרי audit |
| `sitebuilder-hub/server/src/app.ts` | Express app | routes, auth middleware | API skeleton טוב | לשמור כבסיס |
| `sitebuilder-hub/server/src/config/env.ts` | Hub env | `MONGO_URI`, auth/job flags | אין SharePoint env | להוסיף auth/SP strategy |
| `sitebuilder-hub/server/src/models/Site.ts` | site registry | site/status/version/health/admin fields | מרכז registry | להחליף path fields ב-derived model |
| `sitebuilder-hub/server/src/models/Job.ts` | jobs | type/status/progress/logs | טוב לתזמור | לחזק states/evidence |
| `sitebuilder-hub/server/src/models/SiteBackup.ts` | backup metadata | sourcePaths/storagePath | כרגע fake | לקשור לגיבוי אמיתי |
| `sitebuilder-hub/server/src/models/SiteVersionDeployment.ts` | deployment metadata | from/to/status/logs | טוב אבל לא מאומת | לקשור ל-artifacts |
| `sitebuilder-hub/server/src/services/jobs.worker.ts` | worker | `handleVersionUpgrade`, `handleBackup`, `handleAdminSync` | פער קריטי | להחליף no-op/fake ops בפעולות אמיתיות |
| `sitebuilder-hub/server/src/services/sites.service.ts` | CRUD/health | `manualHealthCheck`, `getStats` | registry בלבד | להוסיף real health service |
| `sitebuilder-hub/server/src/services/admins.service.ts` | admin arrays | add/remove/sync job | Mongo בלבד | לחבר למקורות אמיתיים |
| `sitebuilder-hub/server/src/services/backups.service.ts` | backup queue | creates jobs | metadata בלבד | לחבר לתוכנית גיבוי אמיתית |
| `sitebuilder-hub/server/src/services/releases.service.ts` | releases/deploy jobs | `enqueueDeployAll`, `deployReleaseToSite` | deploy metadata | להוסיף artifact verification |
| `sitebuilder-hub/client/src/api/sitesApi.ts` | client API | fetch wrappers | אין auth headers | להוסיף auth/client strategy |
| `sitebuilder-hub/client/src/components/SiteFormModal.tsx` | site form | defaults | default final URL שגוי | לתקן לפי resolver בשלב עתידי |
| `sitebuilder-hub/client/src/pages/SiteDetailsPage.tsx` | site detail | manual health | health לא אמיתי | להחליף/להוסיף read-only check |
| `sitebuilder-hub/client/src/pages/AdminsPage.tsx` | admin UI | source arrays | לא SharePoint | לחבר ל-real sources |
| `sitebuilder-hub/client/src/pages/BackupsPage.tsx` | backups UI | verify/restore metadata | לא גיבוי אמיתי | להציג plan/evidence |
| `sitebuilder-hub/client/src/pages/ReleasesPage.tsx` | releases UI | deploy queue | לא deploy אמיתי | להוסיף artifact/preflight |
| `sitebuilder-hub/client/src/pages/JobsPage.tsx` | jobs UI | auto refresh | UI שימושי | להוסיף evidence/log detail |

## 15. Immediate next steps

1. להקפיא שינויי Hub שמניחים `/app` או paths ידניים, עד שמכניסים path resolver אמיתי.
2. לכתוב tests ל-`sharepointPaths.js` עבור env variants: default, users folder מלא, widgets target `users/site`, bootstrap paths.
3. לתעד רשמית את רשימת TXT files ואת ה-hybrid master/legacy model.
4. ליצור shared `sitebuilder-core` קטן שמתחיל מ-file definitions ו-path resolver בלבד.
5. לעדכן את Hub `Site` model כך שישמור config inputs ו-derived paths נפרדים.
6. להחליף ב-Hub את default final URL מ-`/app` ל-`/siteDB/dist/index.html`.
7. לבנות read-only SharePoint health checker עם adapter ברור, בלי כתיבות.
8. לשנות jobs כך שפעולות שאינן ממומשות לא מסמנות success כאילו בוצעו.
9. להגדיר החלטת auth ל-SharePoint: browser-session runner או backend credential מאושר.
10. לאחר read-only health, להתחיל admin visibility אמיתי: TXT + Site Collection + Owners Group, בלי add/remove בשלב ראשון.

