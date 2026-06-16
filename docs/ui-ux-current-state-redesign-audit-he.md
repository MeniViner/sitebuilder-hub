# דו"ח אודיט UI/UX ותכנון רידיזיין גדול

תאריך: 2026-06-11  
פרויקט: `sitebuilder-hub`  
סביבה שנבדקה: `http://localhost:5177`, API `http://localhost:4100`, Mongo פעיל  
מיקוד: איכות ממשק, סדר מידע, רכיבים, מסכים ותכנון שינוי עיצובי רחב. זה אינו אודיט backend.

## תקציר מנהלים

האתר אינו שבור, ויש בו בסיס טכנולוגי ותפעולי משמעותי: React/Vite, RTL, עמודי ניהול רבים, מערכת tokens בסיסית, מצב בהיר/כהה, רכיבי KPI/Badge/Table משותפים, ותיוג שמנסה להבדיל בין metadata, read-only וכתיבה ל-SharePoint.

הבעיה המרכזית היא מוצרית-עיצובית: הממשק מציג יותר מדי מידע, סטטוסים, כרטיסים ופעולות באותו משקל ויזואלי. כמעט כל מסך נראה כמו "קונסולת CRUD מורחבת" במקום כמו כלי תפעולי שמוביל את המשתמש להחלטה אחת ברורה. התוצאה היא תחושה לא מקצועית: הרבה גבולות, הרבה תגיות, הרבה טקסטים קטנים, הרבה פעולות חסומות, והיררכיה חלשה.

הכיוון הנכון הוא לא "לצבוע יפה יותר" בלבד. צריך רידיזיין של שכבת המוצר:

- להפוך את הדשבורד למסך תעדוף ותמונה ניהולית, לא אוסף כל הנתונים.
- להפוך מסכי פעולה כמו Deploy, Backups ו-Admins לזרימות עבודה guided, לא טפסים וטבלאות באותו עמוד.
- לצמצם שימוש בכרטיסים. להשתמש בכרטיסים רק לפריטים חוזרים, KPIs חשובים או panels ממוקדים.
- לבנות מערכת רכיבים צפופה ומקצועית יותר: toolbar, table, list rows, status strip, operation wizard, drawer, responsive mobile shell.
- להחליף את הניווט במובייל מתפריט ענק בראש העמוד לניווט מכווץ.
- ליצור שפת סטטוסים עקבית: live, cached, metadata, read-only, blocked, write-enabled, needs approval.

## מקורות בדיקה

צילומי מסך נוצרו בזמן ריצה מקומית ונשמרו ב:

- `tmp/ui-audit/dashboard-1440.png`
- `tmp/ui-audit/sites-1440.png`
- `tmp/ui-audit/site-detail-1440.png`
- `tmp/ui-audit/releases-1440.png`
- `tmp/ui-audit/backups-1440.png`
- `tmp/ui-audit/admins-1440.png`
- `tmp/ui-audit/jobs-1440.png`
- `tmp/ui-audit/monitoring-1440.png`
- `tmp/ui-audit/audit-1440.png`
- `tmp/ui-audit/health-1440.png`
- `tmp/ui-audit/settings-1440.png`
- `tmp/ui-audit/dashboard-mobile.png`
- `tmp/ui-audit/sites-mobile.png`
- `tmp/ui-audit/dashboard-dark-1440.png`

קוד מרכזי שנבדק:

- `client/src/styles/index.css`
- `client/src/components/AppShell.tsx`
- `client/src/components/TopBar.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/SectionCard.tsx`
- `client/src/components/KpiCard.tsx`
- `client/src/components/DataTable.tsx`
- `client/src/components/SiteFormModal.tsx`
- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/SitesPage.tsx`
- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/pages/ReleasesPage.tsx`
- `client/src/pages/BackupsPage.tsx`
- `client/src/pages/AdminsPage.tsx`
- `client/src/pages/JobsPage.tsx`
- `client/src/pages/MonitoringPage.tsx`
- `client/src/pages/AuditPage.tsx`
- `client/src/pages/HealthPage.tsx`
- `client/src/pages/SettingsPage.tsx`

## מה יש עכשיו

### ארכיטקטורת UI קיימת

- `AppShell` מציג `TopBar`, `Sidebar` ותוכן ראשי בתוך max width של `1520px`.
- `TopBar` כולל שם מערכת, תיאור קצר וסטטוסים: API, MongoDB, environment, Auth, theme/logout.
- `Sidebar` כולל ניווט לכל המסכים וגם כרטיס "מצב פעולות".
- רוב העמודים משתמשים ב-`PageHeader`, אחריו שורת KPI ואז `SectionCard`.
- קיימים רכיבים משותפים ל-empty/error/loading, טבלאות, badges, dialogs, drawers, copy/link rows.
- יש CSS variables למצב בהיר וכהה.

### מסכים קיימים

- דשבורד
- רשימת אתרים
- פרטי אתר
- גרסאות ופריסות
- גיבויים
- מנהלים
- תורים ו-Jobs
- ניטור והתראות
- יומן פעולות
- בדיקות תקינות
- הגדרות

### חוזקות קיימות

- RTL עובד ברוב המסכים.
- יש הבחנה ראשונית בין metadata/read-only/not-connected.
- המערכת לא נראית כמו mock ריק: יש הרבה פונקציונליות אמיתית.
- build של ה-client עובר.
- מצב כהה קיים ונראה עקבי יחסית.
- יש שימוש טוב ב-lucide icons.
- הטבלאות לפחות עטופות ב-horizontal scroll, כך שהן לא שוברות לגמרי את המסך בדסקטופ.

## בעיות רוחביות

### 1. היררכיית מידע חלשה

כמעט כל דבר מוצג באותו משקל: KPI, פעולה, סטטוס, הסבר, טבלה, warning ו-empty state. בדשבורד, למשל, יש שורת capability, 8 כרטיסי KPI, שני אזורי priority, שלושה panels נוספים ועוד אזור הסבר. המשתמש לא מקבל "מה הדבר הראשון שאני צריך לעשות עכשיו".

תיקון:

- להגדיר לכל מסך primary job אחד.
- להציג עד 3-4 מדדים ראשיים, לא 8.
- להעביר הסברים למידע משני, tooltip, drawer או help panel.
- ליצור `PriorityPanel` לדברים שדורשים טיפול במקום לפזר אותם בכרטיסים.

### 2. שימוש יתר בכרטיסים ומסגרות

ה-UI בנוי מכרטיס בתוך אזור בתוך כרטיס, עם הרבה גבולות וצללים. `SectionCard`, `KpiCard`, `soft-panel`, `surface-card` מופיעים שוב ושוב. זה יוצר תחושה של "בלוקים מפוזרים" ולא של מערכת ניהול אחת.

תיקון:

- להפוך אזורים ראשיים ל-layout unframed או bands.
- לשמור cards רק עבור פריטים חוזרים או panels שצריכים מסגרת אמיתית.
- להחליף חלק מה-`soft-panel` ב-row/list פשוטים עם divider.
- להקטין shadow ברוב המסכים; להשאיר elevated רק ל-dialog/drawer.

### 3. הניווט כבד מדי

בדסקטופ ה-sidebar סביר, אבל במובייל הוא הופך לכרטיס ענק בראש המסך. בצילום mobile, המשתמש צריך לעבור את הניווט לפני שהוא רואה את תוכן הדשבורד. זו אחת הסיבות שהאתר מרגיש לא מקצועי במובייל.

תיקון:

- מובייל: TopBar קומפקטי + כפתור menu.
- Sidebar נפתח כ-drawer, לא כחלק רגיל מה-flow.
- בדסקטופ: להשאיר sidebar קבוע, אבל לצמצם את "מצב פעולות" או להעבירו ל-top status strip.

### 4. יותר מדי תגיות סטטוס

יש הרבה badges בצבעים קרובים, חלק בעברית, חלק באנגלית, חלק טכניים: `Dev/API key`, `metadata`, `read-only`, `SharePoint write`, `Approval required`. בגלל שהכול נראה כמו badge, קשה להבחין בין סטטוס קריטי לבין תיאור מקור מידע.

תיקון:

- לבנות `StatusToken` אחיד עם קטגוריות:
  - `source`: live / cached / metadata
  - `capability`: read-only / write-enabled / not-configured
  - `risk`: safe / warning / blocked / destructive
  - `workflow`: draft / planned / awaiting approval / running / done / failed
- להציג לא יותר מ-2-3 tokens בכל header.
- להעביר סטטוסים טכניים לשורת "System context" או drawer.

### 5. פעולות חסומות עדיין נראות כמו פעולות רגילות

Deploy, backup, restore, bootstrap ו-admin write מסומנים כחסומים כאשר SharePoint write לא מוגדר, אבל עדיין מופיעים ליד הפעולות הרגילות. זה יוצר תחושה של מערכת לא גמורה או לא אמינה.

תיקון:

- פעולות חסומות צריכות להופיע כ-`BlockedActionPanel` עם סיבה אחת ברורה ו-next step.
- כפתור destructive/real write צריך להופיע רק בתוך flow מכוון, לא ככפתור רגיל בין הרבה כפתורים.
- להפריד בין "תכנון read-only" לבין "ביצוע אמיתי" כשני מצבי עבודה שונים.

### 6. טבלאות רחבות לא מקבלות טיפול מוצרי

הטבלאות מקבלות `minWidth` ו-horizontal scroll. זה עובד טכנית בדסקטופ, אבל במובייל מקבלים חלקי טבלה ומידע נחתך. בנוסף, EmptyState בתוך table מרגיש גדול מדי.

תיקון:

- `DataTable` צריך לקבל הגדרות columns עם `priority`, `hideOnMobile`, `renderCard`.
- במובייל: להציג row cards במקום table.
- להוסיף sticky actions/first column בדסקטופ.
- ליצור empty state קומפקטי לטבלאות.

### 7. שפת תוכן לא אחידה

יש ערבוב עברית/אנגלית: `Deploy MVP`, `Release`, `metadata`, `read-only`, `Operations / Bootstrap`, `Audit`. חלק מזה מוצדק בגלל מושגים טכניים, אבל כרגע זה נראה כמו ערבוב לא מכוון.

תיקון:

- להגדיר מילון מונחים:
  - Deploy = פריסה, עם `Deploy` בסוגריים אם צריך.
  - Release = גרסה/Release לפי הקשר.
  - Jobs = תורים/Jobs, לבחור דפוס קבוע.
  - Metadata = מטא-דאטה, לא פעם כך ופעם כך.
- לשמור אנגלית רק למזהים טכניים, API fields, paths ו-log labels.

### 8. צפיפות לא עקבית

חלקים מסוימים מרווחים מאוד, אחרים דחוסים מאוד. הכרטיסים גדולים יחסית, אבל טקסטים בתוכם קטנים. התוצאה היא הרבה שטח מת, ועדיין תחושת עומס.

תיקון:

- להגדיר density scale:
  - dashboard relaxed
  - operational pages compact
  - tables dense
  - forms comfortable
- להוסיף variants לרכיבים: `KpiCard compact`, `SectionCard flat`, `DataTable dense`, `EmptyState table`.

## אודיט לפי עמוד

### דשבורד

מצב נוכחי:

- Header ברור, אבל הדף מתחיל עם הרבה capability/status chips.
- 8 KPI cards לפני שהמשתמש מגיע לתוכן אמיתי.
- "דורשים טיפול", "התפלגות תקינות", "פעילות אחרונה", "Jobs", "אתרים מיושנים" ו"מה מאומת" כולם באותו משקל.
- במובייל הדשבורד ארוך מאוד, והניווט דוחף את התוכן מטה.

שינוי מומלץ:

- להפוך את הדשבורד ל-Command Center:
  - שורת system health קומפקטית: API, DB, SharePoint read/write, Auth.
  - אזור ראשי: "דורשים טיפול עכשיו" עם 3-5 items.
  - 3 KPIs בלבד: אתרים פעילים, בעיות פתוחות, גרסאות מיושנות.
  - פעילות אחרונה כ-timeline קומפקטי.
  - קישור למסכי עומק במקום panels מלאים.
- להסיר את אזור "מה מאומת ומה מטא-דאטה" מהדשבורד ולהפוך אותו ל-help drawer קבוע.

עדיפות: P0.

### רשימת אתרים

מצב נוכחי:

- זה המסך הכי קרוב למסך ניהול טוב.
- עדיין יש 4 KPIs לפני הטבלה, למרות שהמשימה המרכזית היא למצוא ולנהל אתר.
- פילטרים תופסים הרבה גובה.
- טבלת אתרים בדסקטופ נוחה יחסית, אבל במובייל היא הופכת למקטע חתוך.

שינוי מומלץ:

- להפוך את ה-KPIs לשורת summary קומפקטית מעל הטבלה.
- להפוך פילטרים ל-toolbar: חיפוש ראשי, chips לסינון, "עוד סינונים" drawer.
- במובייל להציג site rows כ-cards עם status + owner + actions menu.
- להוסיף bulk actions בעתיד רק אם יש שימוש אמיתי.

עדיפות: P0.

### פרטי אתר

מצב נוכחי:

- העמוד גדול מאוד ומכיל 9 tabs.
- Header מכיל כמה פעולות חזקות, כולל ארכוב, ליד פתיחת אתר ועריכה.
- ה-tabs הם כפתורים רגילים בשורה נגללת, בלי URL state.
- overview עדיין כולל bootstrap/operations/actions, כך שהוא לא באמת "סקירה" נקייה.
- ה-tabs הטכניים כוללים טבלאות רחבות ו-evidence מפורט מדי למסך ראשי.

שינוי מומלץ:

- לפצל את העמוד לשני אזורי מוצר:
  - Site Overview: זהות, בעלים, גרסה, בריאות, next action.
  - Operations Workspace: health, deploy, backups, admins, audit.
- לשמור tabs, אבל עם URL query/path (`/sites/:id/health`) כדי לאפשר שיתוף וקונטקסט.
- להעביר ארכוב לתפריט actions, לא ככפתור danger קבוע ב-header.
- ליצור `SiteHero` קומפקטי: שם, קוד, מצב, owner, final URL.
- evidence tables צריכות להיות בתוך drawer או dedicated evidence page.

עדיפות: P0.

### גרסאות ופריסות

מצב נוכחי:

- המסך מערבב יצירת release, deploy, rollback, גרסאות מיושנות, התפלגות והיסטוריה.
- Deploy חסום מוצג בתוך אותו panel גדול עם טופס פעיל.
- Rollback נמצא באותו אזור כמו deploy רגיל, וזה מעלה סיכון תפיסתי.

שינוי מומלץ:

- להפוך את Deploy ל-wizard בן 4 שלבים:
  1. בחירת release
  2. בחירת target site
  3. Dry-run plan + blockers
  4. Review + approval/run
- Rollback צריך להיות flow נפרד עם warning page וסיכום השפעה.
- יצירת Release צריכה להיות drawer/modal, לא חצי עמוד קבוע.
- גרסאות מיושנות והיסטוריה צריכים להיות מתחת, כמידע תומך.

עדיפות: P0 בגלל סיכון תפעולי.

### גיבויים

מצב נוכחי:

- המסך כולל תכנון גיבוי, הרצה, תזמון, inventory, היסטוריה ושחזור.
- פעולות read-only ו-write מופיעות באותו מרחב.
- Restore מופיע כחלק מהיסטוריה, למרות שהוא פעולה מסוכנת.

שינוי מומלץ:

- לפצל ל-tabs ברורים:
  - Overview
  - Backup plan
  - Schedule
  - Inventory
  - Restore
  - History
- Restore צריך flow נפרד עם confirmation, evidence, current-state backup requirement.
- תכנון גיבוי יכול להיות card מרכזי אחד עם result summary.
- היסטוריה צריכה להיות טבלה נקייה, לא טבלה עם הרבה כפתורים בכל שורה.

עדיפות: P1.

### מנהלים

מצב נוכחי:

- יש שלושה מקורות הרשאה: TXT, Site Collection, Owners Group.
- המסך מנסה להציג live read, sync, repair, add admin, panels ו-diffs ביחד.
- למשתמש קשה להבין "מה המקור האמיתי" ומה הפעולה הבטוחה הבאה.

שינוי מומלץ:

- להציג בראש המסך matrix של שלושת המקורות עם counts וסטטוס סנכרון.
- להוסיף action rail:
  - Read live sources
  - Compare sources
  - Plan TXT repair
  - Add admin
- Add admin צריך wizard קטן: זהות -> מקור יעד -> preview -> run/queue.
- Diffs צריכים להיות אזור מרכזי, לא בסוף ארוך.

עדיפות: P1.

### תורים ו-Jobs

מצב נוכחי:

- המסך פשוט יחסית, וזה טוב.
- כאשר אין Jobs, הוא נראה ריק מאוד עם הרבה KPI אפסיים.
- אישורים קיימים בקוד כ-dialog, אבל צריך לראות אותם כחלק מ-operation review.

שינוי מומלץ:

- להפוך את המסך ל-Operations Queue:
  - tabs/chips: Awaiting approval, Running, Failed, Completed.
  - טבלה צפופה.
  - drawer עם logs, payload, approval, errors.
- להסתיר KPI אפסיים כשאין פעילות או להפוך אותם לשורת summary אחת.

עדיפות: P2.

### ניטור והתראות

מצב נוכחי:

- מסך נקי יחסית.
- עדיין משתמש ב-4 KPI cards גדולים ובטבלה.
- חסרה תחושת "alert triage": מה צריך לעשות קודם.

שינוי מומלץ:

- Alert inbox במקום KPI heavy page.
- הצגת severity, entity, age, suggested action.
- Bulk acknowledge רק אם יש צורך אמיתי.

עדיפות: P2.

### יומן פעולות

מצב נוכחי:

- מסך שימושי אבל טופס הסינון גדול.
- KPIs של הצלחות/כשלונות/פעולות שונות פחות חשובים מהיכולת למצוא רשומה.

שינוי מומלץ:

- Search-first layout.
- פילטרים ב-toolbar/drawer.
- CSV export ב-actions menu.
- Details drawer טוב, כדאי לשמר.

עדיפות: P2.

### בדיקות תקינות

מצב נוכחי:

- מסך ממוקד יחסית.
- KPI cards גדולים מדי ביחס לתוכן.
- read-only action ברור, אבל יכול להיות guided יותר.

שינוי מומלץ:

- health overview כטבלה/list של אתרים.
- כפתור "Run check" inline לכל אתר.
- תוצאות מפורטות ב-drawer.

עדיפות: P2.

### הגדרות

מצב נוכחי:

- מסך טוב להבנת יכולות.
- "מפת פעולות" מציגה הרבה cards, חלקם חוזרים על אותה הודעה.
- זיהוי והרשאות מערבבים login state, bootstrap admins וטופס החלפת מספר אישי.

שינוי מומלץ:

- לחלק לקטגוריות:
  - Identity
  - System health
  - SharePoint capabilities
  - Operation permissions
  - Environment
- operation map צריכה להיות טבלה קומפקטית עם columns: operation, read/write, status, blocker, next step.

עדיפות: P2.

### מודל/טופס יצירת אתר

מצב נוכחי:

- `SiteFormModal` גדול מאוד, עם הרבה sections.
- הוא מתאים למשתמש טכני שמכיר SharePoint paths, פחות ליצירת אתר מהירה.

שינוי מומלץ:

- להפוך ל-stepper:
  1. פרטי אתר בסיסיים
  2. בעלים ויחידה
  3. SharePoint target
  4. ספריות ונתיבים
  5. Review + create
- להציג defaults נגזרים מ-site code.
- להפריד בין "רישום ב-Hub" לבין "Bootstrap SharePoint" כבחירה ברורה בסוף.

עדיפות: P1.

## אודיט רכיבים

### AppShell

בעיה:

- layout עובד בדסקטופ, אבל במובייל ה-sidebar נכנס לפני התוכן.
- אין separation בין global system status לבין page context.

שיפור:

- Desktop: sidebar קבוע, תוכן רחב.
- Mobile: header קומפקטי + nav drawer.
- להוסיף `SystemStatusBar` דק מתחת ל-TopBar או בתוך header.

### TopBar

בעיה:

- יותר מדי status pills ברמה העליונה.
- המותג והסטטוסים מתחרים.

שיפור:

- להשאיר: שם מערכת, environment, כפתור status details.
- להעביר API/Mongo/Auth/SharePoint לתפריט system status או strip קומפקטי.
- במובייל להציג רק שם, env, menu/theme.

### Sidebar

בעיה:

- בדסקטופ סביר, במובייל כבד.
- כרטיס "מצב פעולות" חוזר על מידע שנמצא גם בדשבורד/settings.

שיפור:

- Desktop: navigation בלבד + badge קטן אם write חסום.
- Mobile: drawer.
- להעביר מצב פעולות לרכיב מערכת משותף.

### PageHeader

בעיה:

- Header בסיסי מדי למסכים מורכבים.
- actions לעיתים עמוסים מדי.

שיפור:

- להוסיף variants:
  - `PageHeader simple`
  - `EntityHeader`
  - `OperationalHeader`
- לכל header להגדיר primary action אחד, ושאר הפעולות ב-menu.

### SectionCard

בעיה:

- משמש כמעט לכל דבר, ולכן מאבד משמעות.

שיפור:

- ליצור:
  - `Panel` ללא shadow
  - `SectionBand` ללא מסגרת
  - `Card` לפריטים חוזרים בלבד
  - `DangerZone` לפעולות מסוכנות

### KpiCard

בעיה:

- כל ה-KPI באותו גודל ומשקל.
- icon color נשאר accent גם כאשר tone הוא warning/danger.
- יש יותר מדי KPI cards במסכים.

שיפור:

- `KpiCard` צריך variants: `hero`, `compact`, `inline`.
- tone צריך להשפיע על icon/text accent.
- להציג trend/status/owner only when relevant.
- להגביל כל עמוד ל-3-4 KPI עיקריים.

### DataTable

בעיה:

- אין column model, רק array של כותרות.
- אין responsive card fallback.
- אין sticky action column.

שיפור:

- API חדש:
  - `columns: { key, header, width, priority, align, render }[]`
  - `rowActions`
  - `mobileCard`
  - `emptyVariant`
- להוסיף density, sticky header, sticky actions.

### FilterBar

בעיה:

- grid גדול ולא תמיד מתאים.
- כפתור ניקוי/חיפוש לעיתים יורד שורה בצורה לא מאוזנת.

שיפור:

- Search input ראשי.
- filter chips.
- advanced filters drawer.
- saved views בהמשך.

### Badges

בעיה:

- יותר מדי מילים ומצבים.
- אותו visual style משמש גם ל-source, גם ל-risk וגם ל-workflow.

שיפור:

- ליצור taxonomy אחיד.
- להגביל שימוש ב-badges לסטטוסים קצרים.
- הסבר ארוך יעבור ל-tooltip/drawer.

### EmptyState

בעיה:

- בתוך טבלאות הוא גדול מדי.
- במסכים ריקים הוא תופס שטח וגורם לממשק להיראות לא פעיל.

שיפור:

- `EmptyState table`
- `EmptyState page`
- `EmptyState actionPrompt`

### DetailsDrawer

בעיה:

- רעיון טוב, אבל צריך להפוך אותו לדפוס מרכזי למסכים עם evidence/logs.

שיפור:

- להשתמש בו ל-Audit, Alerts, Jobs, Deployment evidence, Backup evidence.
- במובייל drawer הופך ל-fullscreen sheet.

## תוכנית רידיזיין מוצעת

### שלב 0: החלטות מוצר

תוצר:

- להגדיר 5 workflows ראשיים:
  1. Monitor: מה דורש טיפול
  2. Sites: ניהול registry ופרטי אתר
  3. Deploy: תכנון והרצת גרסה
  4. Protect: גיבויים ושחזור
  5. Access: מנהלים והרשאות

קריטריון קבלה:

- לכל מסך יש primary job, primary action, ו-3 מדדים מקסימום.

### שלב 1: Design system בסיסי

קבצים מרכזיים:

- `client/src/styles/index.css`
- `client/src/components/AppShell.tsx`
- `client/src/components/TopBar.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/PageHeader.tsx`
- `client/src/components/SectionCard.tsx`
- `client/src/components/KpiCard.tsx`
- `client/src/components/DataTable.tsx`
- `client/src/components/MetadataOnlyBadge.tsx`

עבודה:

- להגדיר tokens חדשים למשטחים, status, risk, text, spacing.
- לבנות Shell responsive חדש.
- לבנות status taxonomy.
- לשפר Button/KPI/Table/Panel/Drawer.

קריטריון קבלה:

- אין sidebar ענק במובייל.
- אין nested card visual clutter.
- כל רכיב בסיסי נראה עקבי במצב בהיר וכהה.

### שלב 2: מסכי Core

מסכים:

- Dashboard
- Sites
- Site Details

עבודה:

- לבנות dashboard מחדש סביב "דורשים טיפול".
- לבנות site list עם toolbar וטבלת/כרטיסי אתר responsive.
- לבנות site details מחדש עם entity header ו-operations workspace.

קריטריון קבלה:

- המשתמש רואה בתוך 5 שניות מה דורש טיפול.
- במובייל התוכן מתחיל לפני רשימת ניווט ארוכה.
- פרטי אתר לא מרגישים כמו 9 מסכים דחוסים במסך אחד.

### שלב 3: מסכי פעולה מסוכנים

מסכים:

- Releases
- Backups
- Admins

עבודה:

- Deploy wizard.
- Backup/Restore tabs ו-flow בטוח.
- Admin source comparison ו-add admin wizard.

קריטריון קבלה:

- פעולה חסומה מציגה סיבה ו-next step.
- פעולה מסוכנת לא מוצגת ככפתור רגיל בתוך עמוד עמוס.
- read-only plan ו-real execution מופרדים חזותית.

### שלב 4: מסכי תפעול ותמיכה

מסכים:

- Jobs
- Monitoring
- Audit
- Health
- Settings

עבודה:

- להפוך אותם למסכי console קומפקטיים.
- להשתמש ב-drawers לפרטים.
- לצמצם KPI cards מיותרים.

קריטריון קבלה:

- טבלאות ודאטה צפופים אך קריאים.
- Empty states לא משתלטים על המסך.
- Logs/evidence/details נפתחים בצד ולא דוחפים את כל הדף.

### שלב 5: QA ו-polish

בדיקות:

- build
- desktop screenshots
- mobile screenshots
- dark mode
- table overflow
- long Hebrew/English strings
- disabled/write-blocked states
- keyboard focus

פקודות:

```bash
npm run build:client
npm test
```

## סדר עדיפויות מומלץ

P0:

- Shell responsive חדש.
- Dashboard חדש.
- Sites table/mobile cards.
- Site details entity header + tabs routing.
- Deploy wizard בסיסי.

P1:

- Backup/Restore redesign.
- Admins redesign.
- SiteFormModal stepper.
- DataTable column model.
- Status taxonomy.

P2:

- Jobs/Monitoring/Audit/Health/Settings polish.
- Better empty states.
- Tooltips/help drawer.
- Fine dark mode polish.

## Definition of Done לרידיזיין

- המסך הראשון בדשבורד עונה: מה תקין, מה חסום, ומה דורש טיפול עכשיו.
- בכל עמוד יש פעולה ראשית אחת ברורה.
- אין יותר מ-4 KPIs גדולים בעמוד.
- פעולות write/destructive מופרדות מ-read-only planning.
- מובייל לא מציג sidebar מלא לפני התוכן.
- טבלאות רחבות הופכות לכרטיסי row במובייל.
- כל status badge שייך לטקסונומיה מוסכמת.
- מצב כהה ובהיר נבדקים בצילום.
- build עובר.

## המלצת התחלה מעשית

הצעד הראשון שכדאי לבצע הוא לא לגעת בכל העמודים יחד. להתחיל ב-foundation + שלושה מסכים:

1. `AppShell`, `TopBar`, `Sidebar`, `index.css`
2. `DashboardPage`
3. `SitesPage` + `SitesTable`
4. התחלה של `SiteDetailsPage`

זה ייתן שינוי מורגש מיד, בלי להסתכן בשבירת כל זרימות ה-Deploy/Backup/Admins. אחרי שהשפה החדשה עובדת בשלושת המסכים המרכזיים, אפשר להחיל אותה על שאר המערכת בצורה שיטתית.
