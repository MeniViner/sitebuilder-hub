<div dir="rtl">

# SiteBuilder Hub — דוח־על לפערי תכנון ההצלה

תאריך ביקורת: 14 ביולי 2026  
נקודת בסיס: `5685903b64ccf709fb872522e4e71683b6af9eb7` (`main`, זהה ל־`origin/main`)  
סוג הביקורת: קריאה, הרצה מקומית, צילום, מדידה והשוואה בלבד — ללא שינוי קוד מוצר וללא פעולות כתיבה עסקיות יזומות  
מאגר ראיות: `tmp/sitebuilder-hub-rescue-audit/`

## 1. תקציר מנהלים

SiteBuilder Hub אינו חסר מסכים או יכולות; הוא חסר חוזה מוצר אחד שמכריע מהו ה־Hub, למי הוא מיועד, מהו מקור האמת בכל רגע, מי רשאי לבצע פעולה מסוכנת, ואילו פרטים חייבים להיות גלויים לפני פעולה. כתוצאה מכך נבנו לאורך זמן פתרונות מקומיים רבים — דשבורדים חלופיים, מסכי עזרה, Diagnostics, זרימות Deploy/Backup/Admins, שכבות Evidence וסטטוסים — אך הם מצטברים למערכת שמעמיסה על המשתמש את המודל הפנימי שלה במקום להציע מודל עבודה יציב.

מצב המוצר הנוכחי קיבל **44/100** במדד Rescue Planning Readiness התפקודי: קיימת תשתית משמעותית, אולם החלטות מוצר ותפעול קריטיות עדיין פתוחות. שלמות תמונת התכנון לאחר ביקורת זו היא **92/100**: כל פער חומרי שנמצא ממופה להחלטה, לראיה חסרה או לשער כניסה מפורש; שמונת האחוזים החסרים תלויים בראיות חיצוניות שלא ניתן לייצר בביקורת לא־כותבת, כגון סביבת SharePoint אמיתית, Builder backend, חשבונות RBAC ותרגילי Restore.

חמשת גורמי השורש:

1. אין סמכות מוצר קנונית: פרסונות, שלושת ה־jobs המרכזיים, גבול מול Builder Admin וה־IA לא אושרו.
2. אין חוזה אחיד למקור אמת, freshness ו־evidence; Live, Cached, Metadata, Derived, Stale ו־Unknown מוצגים יחד אך לא נשלטים לפי סמנטיקה אחידה.
3. מודל הבטיחות הוא תצורה ולא החלטת מוצר: ברירת המחדל המקומית היא `AUTH_ENABLED=false`, owner-direct ובלי approvals מתקדמים.
4. אין ממשל UI שמונע צמיחה מחדש: CSS גלובלי, דפים מונוליתיים, 17 יעדים ב־bundle אחד, Labs חשופים, ועזרה טכנית המופעלת כברירת מחדל.
5. זרימות חוצות שכבות אינן state machines משותפים; רכיבי Route מנהלים תכנון, חיבור, כתיבה, evidence והצגה, ולכן בדיקות מקומיות אינן מבטיחות מודל משתמש עקבי.

חמש ההחלטות הדחופות ביותר:

1. מי המשתמשים ומהן סמכויות Owner, Operator, Approver, Auditor ו־Developer.
2. מהו מקור האמת וה־freshness contract לכל שדה תפעולי.
3. האם SharePoint browser-only פירושו פעולות אינטראקטיביות בלבד, או שקיים runner אמין לפעולות מתוזמנות.
4. מהי מדיניות Auth, RBAC, approvals ו־dual control בייצור.
5. מהו כיוון המוצר וה־IA הקנוניים — לרבות דשבורד, Routes ניסיוניים וגבול האחריות מול Builder.

מסקנת התכנון: אין להתחיל “רענון ויזואלי” רחב. תחילה יש לסגור את חוזי המוצר, הנתונים, המצבים וההרשאות המפורטים בסעיף 21. אחרת אותה צפיפות, אותה זליגת Diagnostics ואותם מצבי אמון עמומים יחזרו גם בתוך עיצוב חדש.

## 2. רמת ביטחון ומגבלות הבדיקה

### מה אומת

- כל 17 היעדים הסטטיים ב־`App.tsx`, כל שמונת ה־tabs של אתר, זרימת Add Existing, ושני ענפי Create New (TXT/Mongo) נסקרו בקוד וברמת runtime ככל שההרצה הלא־כותבת אפשרה.
- נאספו צילומי Desktop, Tablet, Mobile, Light ו־Dark; 94 קובצי PNG נשמרו, לרבות גרסאות full-page. צילומי Dark מאוחרים שנעשו לאחר חסימת rate limit מסומנים כלא־תקפים לניתוח תוכן.
- בוצעו מדידות DOM של מילים, headings, controls, links, help icons, badges, cards, גובה מסמך ו־horizontal overflow.
- נסקרו 44 מסמכי Markdown היסטוריים, 12,827 שורות, והטענות המרכזיות הושוו למימוש ול־runtime.
- `npm test` עבר: 62 קבצים, 267 בדיקות. `npm run build` עבר לשרת וללקוח.
- נותחו Routes של API, מדיניות SharePoint, Auth/approval, storage, rate limit, מבנה המודלים, גודל קבצים, CSS, רכיבים ו־bundle.

### מה לא אומת ולמה

- לא בוצעה כתיבת SharePoint, Mongo, Deploy, Rollback, Backup, Restore או Admin repair; זו ביקורת לא־מממשת ולא־משנה.
- לא הייתה סביבת SharePoint אמיתית מחוברת ולא Builder backend פעיל. לכן לא הוכחו permissions, digest, upload/read-back, collection seed או backup artifacts אמיתיים.
- ההרצה הייתה עם Local Developer ו־owner-direct; לא הוכחו תפקידי operator/approver/auditor, self-approval או denial states.
- לא סופקו telemetry, ראיונות משתמשים, נתוני תמיכה, התפלגות production או דרישות device/browser רשמיות.
- לאחר crawl מקיף הופעל rate limit של 180 בקשות לדקה. הדבר עצמו הוא ראיה למגבלת הארכיטקטורה, אך מנע השלמה מהימנה של חלק מצילומי Dark המאוחרים.
- `Page.captureScreenshot` נתקע בשלב Create New המתקדם; ה־DOM והקוד נסקרו, אך אין baseline חזותי לכל שלב.
- לא קיימים במאגר Playwright, Testing Library, jsdom או axe. לכן בדיקות ירוקות אינן ראיה ל־keyboard, focus, screen reader, responsive או E2E.

רמת הביטחון בממצאי מבנה, קוד, טקסט ו־responsive: **Confirmed / Strong evidence**.  
רמת הביטחון בהתנהגות production, הרשאות אמיתיות ופעולות כתיבה: **Unverified**, ומתועדת ברשם הראיות החסרות.

## 3. נקודת הבסיס של המאגר

| פריט | ערך |
|---|---|
| Branch | `main` |
| Commit | `5685903b64ccf709fb872522e4e71683b6af9eb7` |
| Remote | זהה ל־`origin/main` בתחילת הביקורת |
| גרסאות | root `0.1.1`; client/server `0.1.0` |
| Runtime | Node `v24.15.0`; npm `11.12.1` |
| React/Vite | React `18.3.1`; Vite `5.4.19` |
| DB מקומי | Mongo container עם ארבע רשומות Site; כולן דווחו כ־storage לא ידוע |
| Routes לקוח | 17 |
| Site tabs | 8 |
| מסמכי עבר | 44 קבצי Markdown, 12,827 שורות |
| CSS | 10,671 שורות; 215,493 bytes; 1,486 selectors |
| Test | 62 קבצים; 267 בדיקות; עבר |
| Build | עבר; bundle יחיד מעל סף 500 kB |

ה־commit האחרון כולל שינוי במדיניות storage backend; קדמו לו הרחבות workflows/UI וגלי redesign. מצב זה חשוב: הביקורת אינה משווה מוצר ישן לתכנון עתידי בלבד, אלא בוחנת מערכת שעברה כמה סבבי “שיפור” בלי לסגור ממשל מוצר מרכזי.

## 4. התאמת הדוחות ההיסטוריים למצב הנוכחי

המסמכים ההיסטוריים אינם שגויים באופן גורף; רובם מתארים במדויק מה יושם באותו סבב. הבעיה היא שטענת “יושם” הפכה לעיתים בטעות ל“נפתר”. כאשר כל דו״ח סגר Route או workflow בנפרד, לא נוצר gate שמוודא שהמוצר כולו נעשה פשוט, אמין וקוהרנטי יותר.

| נושא | טענת עבר | הראיה הנוכחית | מסקנה |
|---|---|---|---|
| דשבורד | Lab/Candidate נבנו, אך promotion נשאר פתוח | `/` עדיין מציג DashboardPage הארוך; `/dashboard-lab` נמצא בניווט | ההחלטה לא נסגרה, והניסוי הפך לחלק מהמוצר |
| Northstar | הכיוון תואר מאוחר יותר כ־sci-fi ולא מתאים | Route מנותק עדיין compiled ונגיש | דחיית עיצוב לא לוותה במדיניות lifecycle |
| Core UI | דווח על יעד רגוע ומספר KPI מוגבל | runtime מציג שכבות cards וסטטוס כפול | שיפור מקומי לא פתר hierarchy מוצרי |
| Analytics | desktop QA תועד | ב־390px יש overlap ו־scrollWidth 514 | ראיית desktop הוכללה מעבר לתחומה |
| Backups | redesign הושלם ל־desktop; mobile נשאר פתוח | mobile בגובה 2,596px | פער ידוע לא נסגר |
| Site Details | workspace redesign ו־QA חזותי בוצעו | first fold עדיין כבד; mobile בגובה 7,894px | הסימפטום תועד, גורם השורש לא הוכרע |
| Help | “אין פערי עזרה חוסמים” | Help מכיל 3,345 מילים ו־112 headings; icons מופעלים כברירת מחדל | coverage הוחלף בטעות ב־usability |
| SharePoint | browser-only הוא מקור האמת | runtime אכן חוסם server execution, אך קוד REST ו־env instructions ישנים נשארו | הגבול בפועל נכון, הנרטיב והשטח התפעולי סותרים |
| Safety | approval/evidence gates יושמו | owner-direct ו־auth-off הם ברירות מחדל מקומיות | קיים מנגנון, חסרה מדיניות production |
| Mongo | storage awareness/defaults יושמו | ארבעת האתרים המקומיים עדיין `unknown`; production נופל ל־TXT | מעבר הנתונים והחלטת default לא נסגרו |

רשם מלא: `tmp/sitebuilder-hub-rescue-audit/historical-report-reconciliation.csv`.

החלטות מ־2025 שנשארו פתוחות גם כעת: מיקום הרשת, אסטרטגיית Auth, מיקום ו־retention של גיבויים, תפקידי כתיבה, מי יוצר Site Collection, replace מול incremental deploy, מקור אמת לגרסה, dual control, tamper resistance של Audit, וגבול האחריות מול ממשק הניהול המקורי.

## 5. מפת המוצר המלאה

### Routes וייעוד בפועל

| Route | ייעוד בפועל | Shell | הערת תכנון |
|---|---|---|---|
| `/` | תמצית fleet, triage, מצב מערכת וקיצורי דרך | רגיל | מנסה לשרת יותר מדי jobs |
| `/sites` | registry, חיפוש, סינון וכניסה ליצירה | רגיל | source identity ו־storage לא תמיד ידועים |
| `/sites/:id` | workspace תפעולי בן 8 tabs | רגיל | header/readiness חוזרים לפני כל tab |
| `/releases` | releases, deploy, rollback, history | רגיל | inventory ופעולות מסוכנות באותו מרחב |
| `/backups` | overview, run, inventory, schedule, restore, history | רגיל | schedule מתנגש עם browser-only |
| `/admins` | directory, sources, drift, plan/history | רגיל | RBAC ומקור זהות לא אושרו |
| `/jobs` | review, approve/reject, rerun | רגיל | owner-direct משנה את משמעות approval |
| `/monitoring` | alerts ו־acknowledgement | רגיל | ownership ו־escalation לא מוגדרים |
| `/audit` | חיפוש/export של evidence | רגיל | retention ו־tamper model חסרים |
| `/health` | תמונת בריאות רוחבית | רגיל | חופף Dashboard ו־Diagnostics |
| `/diagnostics` | תצורה, origin, connector ו־path debugging | רגיל | developer surface בתוך IA רגיל |
| `/help` | מילון ומאגר עזרה | רגיל | אנציקלופדיה במקום שכבת תוכן מדורגת |
| `/settings` | Auth, backend ו־runtime configuration | רגיל | מערב policy, diagnostics ו־admin |
| `/analytics` | filters, charts ושישה dashboards פנימיים | רגיל | scope רחב מדי למסך אחד |
| `/dashboard-lab` | השוואת חמישה concepts | רגיל ובניווט | Lab זולג ל־normal mode |
| `/dashboard-design-studio` | artboards/discovery | מנותק | compiled ונגיש ללא gate |
| `/dashboard-northstar` | visual north star | מנותק | כיוון שנדחה עדיין shipped |

אין catch-all route, אין gate ל־lab/studio/northstar, ואין lazy loading. ה־App מייבא את כל הדפים באופן סטטי (`client/src/App.tsx:12-28`).

### Site Details

שמונת ה־tabs: Overview, Deployment, Recovery, Access, Health, Hosting, Activity, Advanced. Query parameters ישנים ממופים מחדש (`versions`→Deployment, `backups`→Recovery, `admins`→Access, `jobs/audit`→Activity), ולכן קיימת תאימות, אך גם שכבת שפה היסטורית שממשיכה להתקיים.

### משתמשים משוערים — לא מאושרים

הקוד והטקסט מרמזים על Owner, Operator, Approver, Auditor, Access Admin, Release Operator ו־Developer. אין מסמך מוצר שמגדיר:

- מי נכנס בתדירות יומית ומי רק בעת תקלה;
- מי רשאי לראות diagnostics ו־dangerous configuration;
- מי מכין plan ומי מאשר/מבצע;
- מי אחראי להשלמת partially-created site;
- האם Local Developer הוא מצב פיתוח בלבד או fallback תפעולי.

לכן כל “primary user” ב־scorecards הוא inference ולא עובדה מאושרת. זו החלטה D-001, לא פער מחקר קטן.

### מצבי מערכת ומודים

- Theme: Light / Dark.
- Navigation: button / rail / open, נשמר ב־localStorage.
- Auth/safety: owner-direct מול advanced approvals; auth enabled/disabled.
- Storage: TXT / Mongo / Unknown.
- Execution: browser-sharepoint / mongo-backend / server-local / manual / not-implemented, לצד ערכי legacy.
- Evidence: live / cached / metadata / unknown / stale / failed.
- Product surfaces: normal / help / diagnostics / lab / design-studio / northstar.
- Query modes: filters, focus, tabs, `qa`, concept/view.

ריבוי המודים אינו בעיה רק כי הוא גדול; הבעיה היא שאין חוזה שאומר אילו מודים הם product, support, development או experiment, מי רשאי לראותם ומהי מדיניות היציאה שלהם.

## 6. ממצאי שורש

### R-01 — אין Product Authority קנוני

- חומרה: P0; ביטחון: Strong evidence.
- ראיה: שלושה דשבורדים ניסיוניים לצד production, 14 יעדי Sidebar, overlap בין Dashboard/Health/Monitoring/Analytics/Diagnostics, והחלטות היסטוריות פתוחות.
- הסימפטום: card soup, navigation ארוך, כמה תצוגות “מצב”, ותחרות בין CTA.
- גורם שורש: אין מסמך מאושר של personas, jobs, route ownership ו־canonical dashboard.
- פגיעת משתמש: המשתמש צריך להבין את מבנה המערכת כדי לבחור מסלול.
- החלטה חסרה: D-001–D-004, D-018, D-020.
- השלכת תכנון: אי אפשר לאשר hierarchy, content removal או screen briefs לפני סגירתם.

### R-02 — אין חוזה Data Trust אחיד

- חומרה: P0; ביטחון: Confirmed.
- ראיה: Live/Cached/Metadata/Derived/Unknown/Stale מופיעים במסכים שונים; כל ארבעת האתרים המקומיים הם storage unknown; `OperationalStatusProvider` שומר cache מקומי; דפים טוענים מקורות במקביל.
- הסימפטום: badges רבים, timestamps, evidence panels והסברים חוזרים.
- גורם שורש: freshness, authority ו־fallback מוגדרים ברמת feature, לא ברמת domain contract.
- פגיעת משתמש: לא ברור אם החלטה או פעולה נשענת על אמת חיה.
- החלטה חסרה: D-005, D-011, D-013, D-017.
- השלכת יישום: redesign בלבד יסתיר את העמימות או יצבע אותה מחדש.

### R-03 — בטיחות היא configuration matrix, לא מדיניות מאושרת

- חומרה: P0; ביטחון: Confirmed בקוד, Unverified בייצור.
- ראיה: `AUTH_ENABLED=false`, `HUB_OWNER_DIRECT_MODE=true`, `HUB_ADVANCED_APPROVALS_ENABLED=false` בברירות המחדל; קיים מערך bypass flags; production deploy default בקוד שונה מהדוגמה.
- הסימפטום: מסכים מסבירים שוב ושוב approval, blocked, browser evidence ו־owner-direct.
- גורם שורש: אין RBAC/dual-control contract קנוני.
- פגיעת משתמש: אותה פעולה מקבלת משמעות שונה בין environments בלי שה־IA משתנה.
- החלטה חסרה: D-006–D-008.
- השלכת תכנון: יש לעצב mental model אחד לכל מדיניות מאושרת, לא לכל permutation אפשרי.

### R-04 — Browser-only לא הושלם כחוזה ארכיטקטוני

- חומרה: P0; ביטחון: Confirmed.
- ראיה: policy ו־client חוסמים SharePoint server REST, אך `sharepointOperationClient.ts` עדיין מכיל מעל אלף שורות של auth/digest/folder/upload logic; `.env.example` עדיין מנחה `SHAREPOINT_WRITE_ENABLED=true` ו־cookie/token.
- הסימפטום: Diagnostics ו־Settings צריכים להסביר אילו env vars “ignored”.
- גורם שורש: migration שינתה runtime policy אך לא מחקה את surface, התיעוד והאפשרויות הישנות.
- פגיעת משתמש/מפעיל: סיכון לתצורה מטעה או להחזרת ארכיטקטורה ישנה בעת שינוי עתידי.
- החלטה חסרה: D-008, D-019.
- השלכת יישום: לפני פירוק UI צריך לאשר boundary diagram ורשימת capabilities אחת.

### R-05 — Workflows אינם state machines משותפים

- חומרה: P0; ביטחון: Confirmed.
- ראיה: `SiteFormModal` מנהל Add Existing ו־Create New; validation לבעלים מתבצע מאוחר; Route components מנהלים plan, connector, evidence ו־write orchestration; `SitePage` כולל orchestration של SharePoint.
- הסימפטום: Next נראה פעיל גם כשחסרים owner fields; plan חוסם מאוחר; “שמור” אינו בהכרח “usable”; partially-created נשאר מושג טקסטואלי.
- גורם שורש: אין domain state machine ו־view model משותף בין API, worker ו־UI.
- פגיעת משתמש: progression חזותי אינו שווה readiness, והכשל מתגלה לאחר השקעת זמן.
- החלטה חסרה: D-009–D-013.
- השלכת יישום: יש לאשר state/event/evidence maps לפני screen design.

### R-06 — אין תקציבי UI ותוכן אכיפים

- חומרה: P1; ביטחון: Confirmed.
- ראיה: Help 3,345 מילים; Settings 1,054; Site Access 1,904; 10–43 help icons בדף; 146 font declarations מתחת ל־0.8rem; 155 blocks ב־Help.
- הסימפטום: density, microcopy, badges, cards ו־help בכל מקום.
- גורם שורש: אין content tiers, max-visible-copy, component density או type scale contract.
- פגיעת משתמש: scan איטי, action confidence נמוך וקריאות חלשה.
- החלטה חסרה: D-014–D-016.

### R-07 — ארכיטקטורת Frontend מאפשרת חזרת הכשלים

- חומרה: P1; ביטחון: Confirmed.
- ראיה: CSS גלובלי בן 10,671 שורות; bundle JS יחיד 1.05MB minified; דפים עד 2,754 שורות; 64 inline styles ב־SiteFormModal; אין route lazy loading.
- הסימפטום: חוסר עקביות, regressions responsive, Labs ב־production bundle.
- גורם שורש: boundaries לפי Route ולא לפי domain workflow/state; design tokens חלקיים ואינם נאכפים.
- השלכת יישום: אם מיישמים מסכים מחדש באותו מבנה, הצפיפות והסתירות יחזרו.

## 7. Audit טיפוגרפיה מלא

### המערכת הקיימת

- משפחת font: `Segoe UI`, Arial ו־system sans; מספרים משתמשים לעיתים ב־Consolas / Courier New.
- 339 הצהרות `font-size` ו־69 ערכים ייחודיים.
- 224 הצהרות `font-weight` ו־15 ערכים ייחודיים.
- 146 הצהרות גודל נמצאות בטווח `0.60rem`–`0.79rem`; הערכים הנפוצים הם `0.78` (49), `0.72` (33), `0.76` (25), `0.74` (16).
- משקלים לא־סטנדרטיים שכיחים: 850 (70), 800 (48), 900 (30), 750 (22), 880 (14), 860 (10). בדפדפנים וב־fonts שאינם variable רבים מהם ימופו לאותו משקל, ולכן הם מייצרים complexity בלי hierarchy אמיתי.
- אין type scale מתועד, אין semantic tokens ל־display/title/body/label/meta, ואין מינימום מאושר לטקסט תפעולי.

### ניגודיות

| זוג צבעים | יחס | מסקנה |
|---|---:|---|
| Light muted `#64748b` על white | 4.76:1 | עובר AA לטקסט רגיל בקושי |
| Light subtle `#8793a5` על white | 3.11:1 | נכשל AA לטקסט רגיל |
| Dark muted `#9fb0c7` על `#151e2d` | 7.57:1 | עובר |
| Dark subtle `#728198` על `#151e2d` | 4.23:1 | נכשל AA לטקסט רגיל |

`--text-subtle` משמש בפועל לטקסטים קטנים בגודל 0.68–0.78rem: labels ב־Sidebar, eyebrows, metadata, lab facts וסטטוסים. לכן זה אינו כשל תאורטי בטוקן לא־משומש אלא כשל קריאות קיים. בנוסף, badge קטן, משקל 800 וצבע חלש אינם תחליף לגודל גוף קריא.

### RTL ומספרים

- `dir="rtl"` והיישור הכללי עובדים ברוב המסכים.
- שמות fields, URLs, IDs, version numbers, enum values וקוד מופיעים בתוך משפט עברי בלי policy קבוע של bidi isolation.
- `num`/tabular style מסייע להשוואת מספרים, אך השימוש אינו קנוני בכל timestamps, counts וגרסאות.
- שפה מעורבת כגון “Snapshot priority”, “Portfolio health”, “Target mode”, “Dry-run”, “Execute”, “Top groups”, “Jobs” ו־“Builder backend” הופכת את ה־scanning לבלתי עקבי.

### החלטת טיפוגרפיה הנדרשת

D-015 חייב לאשר:

1. font מקומי שמותר בסביבה הסגורה ו־fallback זהה ב־Windows;
2. scale סמנטי קטן ומחייב;
3. מינימום body/meta תפעולי;
4. משקלים מותרים בפועל;
5. contrast tokens נפרדים ל־light/dark;
6. bidi וכללי מספרים/קוד;
7. screenshot regression על מכונת היעד, לא רק build.

העיצוב הגדול חסום על ידי ההחלטה, לא מפני שאי אפשר לבחור font, אלא מפני שהצפיפות והגובה של כל מסך תלויים בה.

## 8. Text Census ומפת עודף המלל

### מדידות ב־Desktop

| Route/state | מילים | Headings | Controls | Help | Badges | Cards/blocks | גובה px |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sites | 284 | 4 | 59 | 31 | 41 | 8 | 1,096 |
| Releases | 455 | 4 | 83 | 40 | 34 | 14 | 1,736 |
| Backups | 303 | 5 | 24 | 10 | 25 | 8 | 962 |
| Admins | 370 | 5 | 19 | 11 | 17 | 11 | 1,143 |
| Jobs | 380 | 5 | 27 | 18 | 22 | 12 | 1,227 |
| Monitoring | 286 | 6 | 23 | 20 | 15 | 20 | 1,313 |
| Audit | 712 | 5 | 90 | 29 | 69 | 20 | 4,370 |
| Health | 563 | 7 | 56 | 42 | 61 | 23 | 1,906 |
| Diagnostics | 750 | 13 | 65 | 31 | 24 | 54 | 2,772 |
| Help | 3,345 | 112 | 27 | 25 | 15 | 155 | 10,562 |
| Settings | 1,054 | 12 | 47 | 43 | 83 | 74 | 4,000 |
| Analytics | 540 | 11 | 102 | 40 | 35 | 47 | 3,146 |
| Site Overview | 1,047 | 13 | 45 | 14 | 45 | 24 | 3,224 |
| Site Access | 1,904 | 13 | 51 | 33 | 49 | 31 | 2,630 |
| Site Advanced | 1,563 | 6 | 32 | 13 | 28 | 16 | 1,581 |

המדידות הן visible DOM counts במצב local data, לא ספירת strings בקוד. הן מוכיחות שהעומס אינו רק “תחושה”. פירוט מלא ב־`route-metrics.csv`.

### סיווג תוכן

| Tier | תפקיד | מה קורה היום | חוזה נדרש |
|---|---|---|---|
| Action | מה לעשות עכשיו | מתחרה עם badges, KPI ו־explanations | CTA ראשי אחד לכל state |
| Decision evidence | מה חייבים לדעת לפני פעולה | מפוזר בין cards, help ו־diagnostics | evidence summary סמוך להחלטה |
| Status | מה המצב | כמה טקסונומיות וצבעים | vocabulary ומקור אמת מאושרים |
| Guidance | למה/איך | מוצג inline כמעט בכל מסך | progressive disclosure לפי צורך |
| Technical detail | IDs, paths, URLs, connector | זולג ל־normal mode | diagnostics/support surface |
| Glossary/help | מושגים | icons רבים + מאגר ענק | glossary נשלט וחיפוש ממוקד |
| Audit evidence | מה הוכח ומתי | לעיתים badge ולעיתים panel | תבנית אחת עם source/freshness |

### גורמי עודף המלל

1. אי־אמון בנתונים גורם לכל card להסביר את מקורו.
2. ריבוי מודים גורם למסך להסביר את ה־mode הפעיל.
3. אין glossary קנוני, ולכן אותו מושג מוסבר שוב ושוב.
4. Help icons הם ברירת מחדל (`String(value ?? "true") !== "false"`), ולכן עזרה הופכת לרעש קבוע.
5. ה־UI חושף enum names, paths, database names ו־connector internals במקום לתרגם אותם ל־user intent.

### כלל הסרה נדרש

לפני redesign יש לאשר content-removal matrix: כל מחרוזת חייבת להשתייך ל־Action, Evidence, Status, Guidance, Technical או Audit. תוכן שאינו משנה החלטה או פעולה ב־first viewport יוצא מ־normal mode. זהו כלל ממשל; ללא owner ותהליך review, המלל יצמח מחדש.

## 9. הפרדת Normal / Help / Diagnostics / Labs

### Normal

אמור להציג מצב, החלטה, פעולה וראיה מינימלית. בפועל הוא כולל paths, DB targets, runtime config, connector mode, siteDB/siteUsersDb, browser evidence והסברים על policy. זהו technical leakage.

### Help

ה־Help page כולל 3,345 מילים, 112 headings ו־155 blocks; במובייל גובהו 23,829px. הוא משמש glossary, manual, troubleshooting ותיעוד ארכיטקטוני יחד. 10–43 icons לעמוד אינם contextual help ממוקד אלא שכבת מידע נוספת. טענת העבר “אין gaps חוסמים” נכונה מבחינת coverage, אך אינה מוכיחה findability, comprehension או task completion.

### Diagnostics

Diagnostics הוא surface שימושי למפתח/מפעיל: origin, API base, auth fallback, connector check, paths ו־env warnings. אולם הוא מופיע ברשימת הניווט הרגילה, חולק רכיבי presentation עם product routes ובמובייל גולש ל־509px. אין role gate או support-session context.

### Labs

- `/dashboard-lab` מופיע ב־Sidebar ועטוף ב־AppShell.
- Design Studio ו־Northstar מנותקים מה־shell אך עדיין מיובאים סטטית ונגישים.
- Northstar אינו רק וריאציה; יש לו palette, surfaces ו־visual grammar עצמאיים.
- Query params של `qa`, `concept` ו־`view` קיימים ב־runtime.

### חוזה UI Mode הנדרש

| Mode | קהל | נגישות | מידע מותר | lifecycle |
|---|---|---|---|---|
| Normal | משתמש תפעולי | route רגיל | action/status/evidence בלבד | production |
| Help | כל משתמש לפי צורך | context + מרכז ידע | glossary ו־how-to | content-owned |
| Diagnostics | support/admin מורשה | role/session gate | paths, origins, raw evidence | logged support use |
| Lab | צוות product/design בלבד | build או flag נפרד | concepts ו־QA controls | owner + expiry date |

עד שאין חוזה מאושר, אי אפשר לקבוע route removal, navigation או bundle boundaries בביטחון.

## 10. Audit של Shell וניווט

### מבנה

`AppShell` כולל TopBar, SystemStatusBar, Sidebar ותוכן. ה־Sidebar חוזר על brand, state, identity ופעולות; Dashboard חוזר שוב על מצב מערכת/פורטפוליו. במובייל TopBar נשבר לשתי שורות ו־SystemStatusBar הופך ל־details overlay.

### כפילות

- מצב backend/auth/SharePoint מופיע ב־TopBar/SystemStatus, Dashboard, Settings ו־Diagnostics.
- “מה דורש תשומת לב” מופיע ב־Dashboard, Health, Monitoring ו־Analytics.
- פעולות Releases/Backups/Admins נגישות מ־Sidebar, Dashboard, Site Details ולעיתים cards פנימיים.
- Site Details משכפל header, readiness, source ו־actions מעל כל אחד משמונת ה־tabs.

### בעיית IA

14 יעדי Sidebar אינם משקפים 14 jobs נפרדים. הם מערבבים:

- objects: Sites, Releases, Backups, Jobs;
- outcomes: Health, Monitoring, Analytics;
- governance: Audit, Admins, Settings;
- support: Diagnostics, Help;
- experiment: Dashboard Lab.

לכן קיצור labels או שינוי icon לא יפתור את הבעיה. D-004 חייב לבחור מודל ניווט — task-based, domain-based או role-based — על סמך D-001/D-002.

### First viewport

- Dashboard: כמה שכבות summary לפני העבודה העיקרית.
- Site Details: header/readiness/identity צורכים את החלק העליון; ב־mobile התוכן העיקרי נדחק למסמך בגובה 7,894px.
- Releases/Analytics: control surfaces רבים כבר בפתיחה.
- Candidate dashboard ממוקד יותר, אך עדיין עטוף ב־shell וב־lab banner ולכן אינו הוכחת production.

חוזקות לשימור: RTL יציב ברוב ה־shell, שימוש עקבי ב־icons קיימים, status access גלובלי, וקיצור דרך ישיר לאובייקטים חשובים. החוזקות צריכות להיכנס ל־IA החדש, לא להצדיק את הכפילות.

## 11. Audit של Design System

### מלאי

- Tokens בסיסיים ל־surface, border, text, accent, success, warning, danger, info ו־radius.
- ערכת dark נפרדת.
- רכיבים בשימוש רחב: `SectionCard` (כ־75 מופעים), `KpiCard` (54), `LinkRow` (58), `DataTable` (34), `EmptyState` (45), `DetailsDrawer` (11).
- קיימים `PageHeader`, `HelpIcon`, `HelpLabel`, `ConfirmDialog`, `ProtectedActionDialog`, `OperationalSummary`.
- primitives מסוימים קיימים אך אינם בשימוש עקבי; presentation נשען גם על Tailwind utilities, CSS classes ו־inline styles.

### פערים

| תחום | ראיה | משמעות |
|---|---|---|
| Surfaces | 254 radius declarations, 20 ערכים; 124 shadows, 43 ערכים | tokens אינם שולטים בפועל |
| Typography | 69 גדלים, 15 weights | אין scale סמנטי |
| Status | 112 ערכי enum שונים בתוך 288 occurrences; 296 status visuals | palette אינו שווה taxonomy |
| Layout | grids ייעודיים רבים בכל Route | responsive rules אינם composable |
| Inline styles | 64 ב־SiteFormModal, 53 Releases, 38 Settings, 37 Site Details | variants אינם מקודדים ברכיבים |
| Dialogs | שלוש משפחות עם semantics שונות | safety UI אינו אחיד |
| Motion | אין `prefers-reduced-motion`; transitions קיימים | accessibility contract חסר |
| Labs | CSS ניסיוני וייצורי באותו קובץ | אין package/build boundary |

### Dialog inconsistency

`DetailsDrawer` כולל `role=dialog`, `aria-modal`, title id, focus trap, Escape והחזרת focus. לעומתו `SiteFormModal`, `ConfirmDialog` ו־`ProtectedActionDialog` הם fixed divs ללא semantics/focus trap/Escape/focus return. זה מראה שהיכולת קיימת במאגר, אך אינה נאכפת כ־primitive. הבעיה איננה “חסר ARIA” נקודתי; אין contract מחייב לכל overlay, ובפרט ל־actions מסוכנים.

### Foundations שיש לאשר

1. semantic type scale;
2. spacing/radius/surface tiers;
3. status vocabulary ומיפוי צבעים;
4. action hierarchy;
5. form, stepper, validation ו־blocked state;
6. source/freshness/evidence primitive;
7. dialog/drawer/popover semantics;
8. table-to-mobile-card contract;
9. density budgets;
10. experimental isolation.

## 12. Scorecard לכל מסך

מפתח: “מצבים” מתאר גם מצבים שנמצאו בקוד ולא בהכרח הופקו חזותית. “חסר” פירושו evidence שחייב להיאסף, לא טענה שהמצב אינו קיים.

### `/` — `DashboardPage`

1. ייעוד מתוכנן: תמונת מצב ו־triage. בפועל: מצב מערכת, fleet, decisions, KPIs, charts, watchlists, activity וקיצורי דרך.
2. משתמש משוער: Owner/Operator. Job: להבין מה דורש פעולה עכשיו.
3. פעולה ראשית: אין אחת יציבה. מתחרות: Sites, Releases, Backups, Jobs, Health ו־Analytics. פעולות מסוכנות מועברות ל־routes אחרים.
4. hierarchy/first fold: production dashboard הוא רצף cards וסטטוסים, כולל מידע שכבר מופיע ב־shell.
5. מדידה: mobile 6,136px; 54 controls, מהם 19 מתחת ל־40px. צילום: `38-mobile-dashboard-light.png`.
6. leakage/שפה: backend, evidence, jobs, release ומונחים אנגליים. Help/status משוכפלים.
7. מצבים: loading/error/empty/success קיימים; freshness מגיע מכמה APIs ולא מסוכם בחוזה אחד.
8. Responsive/RTL/A11y: אין overflow אופקי שנמדד, אך המסמך ארוך והטקסט הזעיר נפוץ. RTL עובד.
9. ארכיטקטורה: ארבע קריאות page ב־`Promise.all` בנוסף ל־shell/auth/status. חוזקה: מגוון מידע תפעולי וקישורים אמיתיים.
10. סימפטום: card soup. שורש: אין top jobs/canonical direction. החלטות D-001–D-005; evidence E-006/E-007. P1, Confirmed.

### `/sites` — `SitesPage`

1. ייעוד מתוכנן ובפועל: registry וחיפוש, עם כניסה ל־Add Existing/Create New.
2. משתמש: Owner/Operator. Job: למצוא אתר או לצרף/ליצור אותו.
3. ראשית: Add site או פתיחת site; מתחרות: search, tabs, storage/environment/status/health/version/sort/edit. risky: creation path.
4. hierarchy: command overview, quick stats, toolbar ורשימה; 59 controls ו־31 help icons ב־desktop.
5. מדידה: 284 מילים, 41 badges, 1,096px desktop; 2,585px mobile; 57 מתוך 64 controls קטנים מ־40px במובייל.
6. leakage: storage backend, versions, health/source; mixed terminology.
7. מצבים: loading, error, empty, filtered-empty, unknown storage. ארבעת האתרים המקומיים unknown.
8. Responsive: אין overflow, אך touch targets צפופים. RTL תקין. modal entry אינו נגיש במלואו.
9. ארכיטקטורה: 1,265 שורות, 15 state hooks, 29 API refs. חוזקה: filters ו־registry identity עשירים.
10. סימפטום: control density. שורש: registry, migration ו־operations entry באותו מסך. D-004/D-005/D-013; E-006. P1, Confirmed.

### `/sites/:id` — `SiteDetailsPage`

1. ייעוד מתוכנן: workspace אחד לאתר. בפועל: שמונה domains ותצורות legacy.
2. משתמש: Owner/Operator/Access/Release. Job משתנה לפי tab — אין persona אחת.
3. ראשית: tab-specific action. מתחרות: giant header, readiness, identity, links ו־actions. risky: deploy/rollback/restore/permissions.
4. hierarchy: context block חוזר לפני כל tab; first fold דוחק את תוכן העבודה.
5. מדידה לפי tab: Overview 1,047 מילים/3,224px; Deployment 336/1,452; Recovery 592/2,244; Access 1,904/2,630; Health 617/2,521; Hosting 562/2,580; Activity 481/1,905; Advanced 1,563/1,581. Mobile Overview 7,894px; Recovery 4,513px.
6. leakage: URLs, paths, siteDB, siteUsersDb, runtime config, connector/evidence. עברית/אנגלית מעורבות.
7. מצבים: loading/not-found/error, live/cached/stale/failed/unknown, plan/blocked/running/success. לא כל שילוב הופק ב־runtime.
8. Responsive: אין overflow נמדד, אך scroll חריג; tabs ו־controls קטנים. RTL טוב ברובו. Protected dialogs חסרי focus contract.
9. ארכיטקטורה: 2,420 שורות, 14 state hooks, 29 API refs, 37 inline styles; orchestration חוצה browser/API. חוזקה: context עשיר ותאימות deep links.
10. סימפטום: workspace צפוף. שורש: object page משמש שמונה products ואין view model משותף. D-001/D-004/D-005/D-008–D-013; E-001–E-005. P0, Confirmed.

### `/releases` — `ReleasesPage`

1. ייעוד: release inventory, deploy, rollback, history; בפועל ארבעה workflows במסך אחד.
2. משתמש: Release Operator/Approver. Job: לבחור artifact ולשנות גרסה בבטחה.
3. ראשית לפי tab: create/review release, plan/dry-run/execute deploy, plan/execute rollback. competing: 83 controls. risky: deploy ו־rollback.
4. hierarchy: tabs, current release, target mode, target selector, plan/evidence; first fold עמוס.
5. מדידה: 455 מילים, 40 help, 34 badges, 14 cards, 1,736px desktop; 3,692px mobile.
6. leakage: Target mode, Dry-run, Execute, artifact/manifest, browser evidence, dist paths.
7. מצבים: empty/loading/error, incompatible/blocked, plan fresh/stale, approval required, browser required, running/partial/failed/success.
8. Responsive: no page overflow, אך 32 מתוך 62 controls קטנים במובייל. RTL מעורב עם English controls. dialog safety לא אחיד.
9. ארכיטקטורה: 2,754 שורות, 21 state hooks, 39 buttons, 22 API refs, 53 inline styles; חמש קריאות פתיחה ב־Promise.all. חוזקה: gates, plan ו־dry-run קיימים.
10. סימפטום: cognitive overload. שורש: inventory, planning, approval, execution ו־evidence אינם boundaries נפרדים. D-007/D-008/D-011/D-012; E-003/E-005. P0, Confirmed.

### `/backups` — `BackupsPage`

1. ייעוד: backup/recovery; בפועל overview, run, inventory, schedule, restore, history.
2. משתמש: Operator/Approver. Job: להבטיח recoverability ולהחזיר אתר.
3. ראשית: run backup או restore; מתחרות: scope, schedule, inventory ו־history. risky: restore.
4. hierarchy: desktop יחסית קומפקטי, אך שישה tabs ומודל execution כפול.
5. מדידה: 303 מילים, 10 help, 25 badges, 962px desktop; 2,596px mobile.
6. leakage: TXT browser, Mongo Builder, artifact/evidence, RPO-like details בלי policy.
7. מצבים: plan/blocked/approval/browser-required/running/verify/failed/success; schedule enabled/waiting אינו מסביר ownership מלא.
8. Responsive: desktop report היה מוגבל; mobile ארוך ו־24 מתוך 26 controls קטנים. RTL עובד.
9. ארכיטקטורה: 1,316 שורות, 10 state hooks, 13 API refs. חוזקה: restore review, typed confirmation ו־evidence gates.
10. סימפטום: schedule מציע automation. שורש: browser-only אינו יכול לבצע SharePoint unattended בלי runner. D-008/D-010; E-004. P0, Strong evidence.

### `/admins` — `AdminsPage`

1. ייעוד: access directory, sources, drift ותיקון.
2. משתמש: Access Admin/Approver. Job: להבין מי מורשה ולתקן פער.
3. ראשית: plan/execute repair; מתחרות: overview, users, sources, drift, history. risky: permission writes.
4. hierarchy: חמישה tabs, directory counts ו־source state.
5. מדידה: 370 מילים, 11 help, 17 badges, 1,143px desktop; 2,173px mobile.
6. leakage: SharePoint groups, Mongo source, evidence, sync state, raw identities.
7. מצבים: source unavailable, drift, plan, approval, browser evidence, failure/success.
8. Responsive: no overflow; 18 מתוך 19 controls קטנים במובייל. dialog custom כולל semantics טובים יותר מה־global dialogs.
9. ארכיטקטורה: 1,237 שורות, 12 state hooks, 23 inline styles. חוזקה: separation בין inspect/plan/execute והצגת source.
10. סימפטום: identity complexity. שורש: persona/RBAC/source authority לא מאושרים. D-001/D-005–D-008; E-001/E-002/E-005. P0, Strong evidence.

### `/jobs` — `JobsPage`

1. ייעוד ובפועל: queue, approval, reject, rerun וחקירה.
2. משתמש: Approver/Operator. Job: לקדם או לטפל בעבודה תקועה.
3. ראשית: inspect/approve/reject/rerun; risky: approval/rerun.
4. hierarchy: status groups, filters, details/action surfaces; shell identity משנה את המשמעות.
5. מדידה: 380 מילים, 18 help, 22 badges, 1,227px desktop; 2,296px mobile.
6. leakage: job types, execution connector, evidence/error codes.
7. מצבים: queued/waiting approval/approved/claimed/running/failed/completed/rejected/expired/browser-required.
8. Responsive: 28 מתוך 29 controls קטנים במובייל. RTL סביר, אך enums אנגליים.
9. ארכיטקטורה: 837 שורות; policies מפוזרות בין jobs, auth owner mode ו־operation services. חוזקה: audit/rerun paths ובדיקות TTL/self-approval.
10. סימפטום: queue עמוס בסטטוסים. שורש: production approval contract לא נקבע. D-006/D-007; E-005. P0, Confirmed בקוד.

### `/monitoring` — `MonitoringPage`

1. ייעוד ובפועל: alert list, refresh ו־acknowledgement.
2. משתמש: Operator. Job: לזהות incident ולקחת בעלות.
3. ראשית: acknowledge/open related object; מתחרות: filters/status cards. risky: ack שמעלים אות ללא ownership contract.
4. hierarchy: 20 cards ל־286 מילים; alert/status grammar שולט.
5. מדידה: 23 controls, 20 help, 15 badges, 1,313px desktop.
6. leakage: health/job/backend source details.
7. מצבים: loading/empty/active/acknowledged/error; escalation/snooze/assigned אינם contract מאושר.
8. Responsive: לא צולם mobile ייעודי בסבב התקין; code/media queries בלבד. RTL likely; evidence E-011.
9. ארכיטקטורה: route מקביל ל־Dashboard/Health. חוזקה: acknowledgement ו־direct links.
10. סימפטום: עוד “מצב מערכת”. שורש: triage ownership וגבול בין monitoring/health/dashboard לא מוגדרים. D-002/D-004/D-005; E-007/E-011. P1, Strong evidence.

### `/audit` — `AuditPage`

1. ייעוד: חקירה, report ו־export.
2. משתמש: Auditor/Security/Owner. Job: להוכיח מי עשה מה ומתי.
3. ראשית: search/filter/export; competing: 90 controls. risky: export של מידע רגיש.
4. hierarchy: filter/report/data density; 69 badges.
5. מדידה: 712 מילים, 29 help, 20 cards, 4,370px desktop.
6. leakage: raw event/action/status/source fields ו־JSON.
7. מצבים: loading/error/empty/filtered/export success/failure; retention/tamper לא מוצגים כי אינם מוגדרים.
8. Responsive: לא צולם mobile תקין; tables נשענות על overflow/card patterns. RTL mixed with identifiers.
9. ארכיטקטורה: list/report/export endpoints קיימים. חוזקה: audit surface מפורש ויכולת export.
10. סימפטום: צפיפות events. שורש: evidence schema ו־compliance contract לא מאושרים. D-005/D-017; E-012. P0 לתפעול, Strong evidence.

### `/health` — `HealthPage`

1. ייעוד: health portfolio; בפועל summary, filters, evidence ו־drawer.
2. משתמש: Operator. Job: לזהות אתר לא תקין ולהבין למה.
3. ראשית: inspect/refresh/open site; competing: 56 controls ו־61 badges.
4. hierarchy: KPIs, sections ו־drawer; overlap עם Dashboard/Monitoring.
5. מדידה: 563 מילים, 42 help, 23 cards, 1,906px desktop; 3,445px mobile.
6. leakage: probe sources, storage/backend, timestamps.
7. מצבים: live/cached/stale/failed/unknown; auto-safe-read TTL.
8. Responsive: 34 מתוך 50 controls קטנים במובייל. `DetailsDrawer` הוא overlay הנגיש ביותר במערכת.
9. ארכיטקטורה: auto read + manual refresh + operational status. חוזקה: freshness/evidence מפורשים יחסית.
10. סימפטום: badge density. שורש: health authority/freshness וגבול route לא אושרו. D-004/D-005; E-001/E-002. P1, Confirmed.

### `/diagnostics` — `DiagnosticsPage`

1. ייעוד ובפועל: תמיכה טכנית ובדיקות connector/config.
2. משתמש: Developer/Support Admin. Job: להסביר מדוע חיבור נכשל.
3. ראשית: Check SharePoint/refresh/copy. competing: site selection, paths, origins ו־warnings.
4. hierarchy: 54 blocks ו־13 headings; הטכני הוא התוכן הראשי.
5. מדידה: 750 מילים, 65 controls, 31 help, 2,772px desktop; 5,544px mobile; overflowX, scrollWidth 509.
6. leakage: מוצדק בתוך Diagnostics, אך route אינו מופרד מ־normal.
7. מצבים: local fallback, configured/missing, browser success/fail, backend disabled, path checks, unknown.
8. Responsive: כשל אופקי מוכח; code/URL lengths ו־tables הם גורם סביר. RTL אינו מבודד raw paths.
9. ארכיטקטורה: משלב diagnostics API, sites API ו־browser check. חוזקה: מקור תקלות מפורט ופעולות copy.
10. סימפטום: technical density. שורש: אין support mode gate/contract. D-006/D-008/D-019; E-001/E-010. P1, Confirmed.

### `/help` — `HelpPage`

1. ייעוד: עזרה; בפועל glossary + manual + troubleshooting + architecture encyclopedia.
2. משתמש: כל המשתמשים, ללא התאמה לתפקיד. Job: להבין מושג או לפתור blocker.
3. ראשית: search/browse; competing: 112 headings ו־155 blocks.
4. hierarchy: coverage לפי sections; אין task-first prioritization.
5. מדידה: 3,345 מילים; 10,562px desktop; 23,829px mobile.
6. leakage: technical terms בכמות גבוהה; icons בכל product route.
7. מצבים: search/filter/no-result; אין feedback ownership/content freshness.
8. Responsive: אין overflow, אך אורך קיצוני ו־27/27 controls קטנים. RTL mixed terminology.
9. ארכיטקטורה: `helpContent.tsx` כ־984 שורות; help key binding רחב. חוזקה: תוכן קיים וניתן לחיפוש.
10. סימפטום: “יש הסבר לכל דבר”. שורש: אין content strategy/owner/glossary. D-014; E-007/E-015. P1, Confirmed.

### `/settings` — `SettingsPage`

1. ייעוד: הגדרות; בפועל auth, backend, runtime policy, health ו־technical configuration.
2. משתמש: Owner/Admin/Developer. Job: לדעת אם הסביבה מוכנה ולשנות policy.
3. ראשית: login/configure/check; competing: 47 controls, 83 badges, 74 blocks. risky: auth/backend policy changes.
4. hierarchy: כמה sections ו־tables; first fold מערב identity ו־warnings.
5. מדידה: 1,054 מילים, 43 help, 4,000px desktop; 10,069px mobile.
6. leakage: env names, Builder backend, auth fallback, manual fields.
7. מצבים: configured/missing/disabled/local fallback/error/health. לא הוכח שינוי config.
8. Responsive: 30 מתוך 33 controls קטנים במובייל; no overflow. RTL mixed English.
9. ארכיטקטורה: UI תלוי diagnostics/config endpoints; 38 inline styles. חוזקה: truthfulness לגבי missing configuration.
10. סימפטום: settings כדף dump. שורש: policy, admin ו־diagnostics לא הופרדו. D-006–D-008/D-013/D-019; E-002/E-005. P0, Confirmed.

### `/analytics` — `AnalyticsDashboardPage`

1. ייעוד: portfolio analysis; בפועל hero, insight queue, decision map, advanced filters, שישה dashboards פנימיים, chart builder, heatmap וטבלאות.
2. משתמש: Owner/Analyst. Job: להפיק החלטה מהפורטפוליו.
3. ראשית: quick view/action insight; competing: 102 controls, filters ו־chart modes.
4. hierarchy: כמה dashboards בתוך dashboard; first viewport נותן score, facts ו־insights אך ממשיך לעומס גדול.
5. מדידה: 540 מילים, 40 help, 47 cards, 3,146px desktop; 5,938px mobile; scrollWidth 514.
6. leakage/שפה: Snapshot priority, Portfolio health, Top groups, widgets target, evidence confidence.
7. מצבים: loading/error/empty/filters/no groups; freshness inherited from sites/jobs without unified source summary.
8. Responsive: overlap חזותי מוכח בגרף/אחוזים, overflow אופקי; 93 מתוך 104 controls קטנים במובייל.
9. ארכיטקטורה: 1,482 שורות, chart implementation מקומי, six suites; DataTable minWidth ו־line chart 38rem. חוזקה: filtering ו־decision links עשירים.
10. סימפטום: feature-rich dashboard. שורש: אין analytics decision brief או responsive budget. D-002/D-004/D-005/D-016; E-006/E-007. P1, Confirmed.

### `/dashboard-lab` — `DashboardLabPage`

1. ייעוד ובפועל: השוואת concepts, כולל candidate.
2. משתמש: Product/Design/Engineering, לא operator.
3. ראשית: switch concept/inspect links; אין risky action ישיר.
4. hierarchy: candidate ממוקד יותר מה־production dashboard, אך lab banner ו־shell נשארים.
5. מדידה: 408 מילים, 17 controls, 9 help, 1,412px desktop; 3,065px mobile.
6. leakage: QA/design labels ו־facts.
7. מצבים: חמישה concepts, `concept` ו־`qa` query.
8. Responsive: no overflow; 11 controls קטנים מתוך 31 mobile. RTL תקין.
9. ארכיטקטורה: global CSS ו־production bundle. חוזקה: evidence להשוואת directions.
10. סימפטום: ניסוי נראה כמו product route. שורש: lifecycle/gating לא קיים. D-003/D-020; E-007. P1, Confirmed.

### `/dashboard-design-studio` — `DashboardDesignStudioPage`

1. ייעוד: discovery/artboards; בפועל מסך detached רגוע יותר.
2. משתמש: צוות Design/Product.
3. ראשית: view/query exploration; אין פעולה תפעולית אמיתית.
4. hierarchy: surface יחיד ומרווח יחסית; לא משתמש ב־AppShell.
5. מדידה: 291 מילים, 4 controls, ללא help/badges, 1,439px desktop; 3,404px mobile.
6. leakage: design language, לא operational leakage.
7. מצבים: `view`/`qa`; לא product states.
8. Responsive: no overflow; detached shell makes comparison imperfect.
9. ארכיטקטורה: imported statically ו־CSS ראשון בקובץ הגלובלי. חוזקה: clarity ו־visual calm.
10. סימפטום: route זמין. שורש: experiment isolation חסר. D-003/D-020. P2 כחוויית משתמש, P1 כממשל, Confirmed.

### `/dashboard-northstar` — `DashboardNorthStarPage`

1. ייעוד: visual north star; בפועל concept dark עצמאי.
2. משתמש: Design/Product.
3. ראשית: exploration; links קיימים אך product action אינו קנוני.
4. hierarchy: dramatic visuals ו־four surfaces; detached מה־shell.
5. מדידה: 215 מילים, control אחד, 4 blocks, 1,301px desktop; 3,219px mobile.
6. leakage: design concept, לא normal terminology.
7. מצבים: QA בלבד.
8. Responsive: no overflow; theme עצמאי שאינו מייצג Light/Dark product.
9. ארכיטקטורה: custom token universe בתוך global CSS. חוזקה: exploration עשיר.
10. סימפטום: rejected direction shipped. שורש: no expiry/promotion/removal gate. D-003/D-020. P1 governance, Confirmed.

### מסקנת scorecards

אין Route שלא נסקר. הממצאים החוזרים אינם “כל מסך קצת צפוף”, אלא ארבע תבניות מערכתיות:

1. route אחד מנסה לארח כמה jobs ותפקידים;
2. source/freshness/safety מוסברים מחדש בכל route;
3. mobile מתכווץ באמצעות stacking, לא באמצעות prioritization;
4. support/lab/technical surfaces אינם מופרדים מה־product contract.

המלאי המכני: `screen-inventory.csv`; המדידות: `route-metrics.csv`; הצילומים: `screenshots/`.

## 13. Audit של כל הזרימות הקריטיות

### A. Add Existing Site

| שלב | מה קורה | ראיה/פער |
|---|---|---|
| כניסה | Sites → Add site → Existing | צילום `26-add-site-choice-desktop-light.png` |
| Basic | name, code, description, environment, unit, storage, status, version, notes | יותר metadata מהנדרש לזיהוי ראשוני |
| Connection | SharePoint URL/final app ו־path preview | physical identity אינה מוגדרת כישות אחת |
| Detect | מציע storage/backend/siteId/API ref/paths/runtime config | detection הוא evidence מסייע, לא source contract מאושר |
| Validate | מסכם blockers; live connection אמור להיבדק אחרי save | שם השלב מבטיח יותר ממה שנבדק |
| Save | “שמור והתחל מעקב” | שומר registry, אינו מוכיח usability |
| Post-save | האתר אמור להופיע ולהיכנס ל־monitoring/health | אין state קנוני “registered but not usable” |

מה משתנה ב־Hub: רשומת registry והמטא־דאטה שנקלט.  
מה משתנה ב־SharePoint: לפי הזרימה המוצגת — דבר אינו אמור להשתנות בעת הצירוף עצמו.  
מה לא הוכח: permissions, digest, path existence, runtime config ו־read-back אמיתי.  
איך המשתמש יודע שהאתר usable: כיום רק לאחר בדיקה חיה מאוחרת; ה־save עצמו אינו evidence מספיק.

Root gap: “registered”, “connected”, “validated” ו־“usable” אינם מצבי domain מחייבים. Severity P1; Decisions D-005/D-008/D-009; Evidence E-001.

### B. Create New TXT Site

הזרימה כוללת שמונה שלבים: Type, Basic, Owners, Target, Plan, Provision, Deploy, Verification.

1. Registry: final save יכול ליצור Site metadata.
2. SharePoint libraries/folders: plan מציג מבנה תיקיות ו־TXT seed.
3. TXT seed: תלוי browser connector וב־SharePoint path.
4. Runtime hosting: `finalApp`/dist path ותצורת runtime.
5. Initial deploy: בחירת release/artifact, עם מצב partially-created עד read-back/index verification.
6. Verification: אמור לאסוף evidence, health ו־readiness.

ממצאי runtime:

- כרטיס TXT נראה נבחר בתחילה אך הטקסט אומר selection required ו־Next חסום עד בחירה מפורשת.
- לאחר Basic, ניתן לעבור מ־Owners ריק ל־Target.
- ב־Plan הופיעו blockers של personal number/email לבעלים; כפתור Next נראה פעיל אך לא קידם.
- `goNext` חוסם errors רק בשלבי plan/validate/verification (`SiteFormModal.tsx:676-699`); validation המלא נמצא ב־`516-568`, ו־`nextDisabled` מטפל בעיקר בבחירת storage (`662-663`).
- release ראשוני נבחר מתוך נתוני runtime; אין הוכחה שהוא artifact production מתאים.

הסימפטום הוא late validation. גורם השורש הוא שה־stepper מייצג collection order, לא state machine של readiness, והכפתור אינו משקף את תנאי המעבר. “Partially-created” מופיע כהסבר, אך אין ownership, timeout, retry/resume ו־cleanup contract מאושרים.

מצב Ready חייב להיות מוגדר רק כאשר קיימים: registry id, storage=TXT, owner identity מאומתת, SharePoint target קיים, folders/seed נקראו חזרה, artifact deployed, runtime index/health עברו, evidence נשמר ו־freshness גלוי. ההגדרה טרם אושרה.

Severity P0; Decisions D-005/D-008–D-012; Evidence E-001/E-003/E-005.

### C. Create New Mongo Site

אותו stepper, אך ה־plan תלוי Builder backend וב־release compatible.

ממצאי runtime:

- ניתן לעבור מ־Owners ריק ל־Target.
- Plan דרש owner personal number/email, Builder backend ו־Mongo-compatible release.
- נדרש “Create Mongo plan” מפורש. הטקסט מערב “יצירת registry” עם “שום דבר לא ירוץ עד save”, ולכן plan ו־execution boundary אינם חדים.
- storage default production הוא TXT כאשר env חסר (`storageBackendPolicy.service.ts:15-35`), אך החלטת המעבר ל־Mongo אינה מאושרת.

מפת האובייקטים הנדרשת:

| אובייקט | סמכות מוצעת להחלטה | evidence שחסר |
|---|---|---|
| Hub Site registry | Hub DB | fixture production ו־migration quality |
| Builder backend selection | Settings/config | backend אמיתי |
| Mongo registry/database/collection | Builder | create/read-back drill |
| Seed data | release artifact | compatibility contract |
| Owners/admins | identity/access model | RBAC accounts |
| Runtime config | deployed config | closed-network runtime proof |
| SharePoint hosting | browser connector | real SP permissions/digest |
| Initial deploy | release workflow | deploy/rollback drill |
| Health | source/freshness contract | live probe |
| Backup capability | backup provider | backup/restore drill |

Ready אינו יכול להיות “save succeeded”. הוא חייב לכלול read-back מכל authority והוכחת backup capability. כרגע אין evidence אמיתי לכך. Severity P0; Decisions D-005/D-008–D-013; Evidence E-002–E-005.

### D. Deploy

הזרימה הנצפית: Releases → Deploy → release → target mode (all/single/multiple) → targets → plan → dry-run → execute.

חוזקות:

- artifact compatibility, target inventory, plan freshness, backup/evidence gates ו־post-deploy health קיימים בקוד ובבדיקות;
- browser SharePoint מול Mongo backend מוצגים במפורש;
- batch והיסטוריה קיימים.

פערים:

- version source of truth אינו מאושר;
- replace מול incremental ו־partial batch failure אינם החלטת מוצר;
- owner-direct יכול לעקוף את mental model הרגיל של approval;
- `Promise.all` page bootstrap ו־rate limit עלולים להפיל את המסך עוד לפני plan;
- UI כולל אנגלית תפעולית ואפשרויות רבות לפני primary intent.

Success מוכח רק אם artifact, target snapshot, connector execution, read-back, health, audit ו־evidence קשורים לאותו operation id. הקוד מכיל חלקים רבים, אך לא בוצע drill אמיתי. Severity P0; D-007/D-008/D-011/D-012; E-003/E-005.

### E. Rollback

הזרימה: target/version → rollback plan → backup evidence → confirmation → execution → read-back/health/audit.

הבעיה העיקרית אינה confirmation copy. חסרים:

- authority ל־“previous good version”;
- מגבלת age/freshness ל־backup;
- semantics אם ה־batch הצליח חלקית;
- מי רשאי לאשר ומי חייב להיות שונה מהמבצע;
- מה קורה כאשר browser נסגר באמצע.

`ProtectedActionDialog` המשמש פעולה מסוכנת חסר focus trap, Escape ו־focus return. לפיכך קיימת גם חסימת נגישות בפעולה קריטית. Severity P0; D-006–D-012; E-003/E-005/E-008.

### F. Backup, Schedule ו־Restore

Backup:

- scope site/all → plan → TXT browser או Mongo backend → artifact → verify → inventory/history.
- לא הוכרע היכן artifact חי, מי שומר אותו, retention, encryption או tamper model.

Schedule:

- ניתן לשמור schedule כ־enabled.
- SharePoint write הוא browser-only, ולכן worker לא יכול להשלים פעולה unattended.
- אם הכוונה היא “תזכורת שממתינה למשתמש בדפדפן”, המונח schedule מטעה; אם הכוונה היא automation, חסר runner. זו סתירת מוצר, לא bug חזותי.

Restore:

- select artifact → review → typed confirmation → evidence gates → connector/backend execution → health/audit.
- חוזקות: review ו־typed confirmation.
- חסר: RPO/RTO מאושר, restore drill, authority של artifact, cross-storage compatibility, cancellation/recovery באמצע.

Severity P0; D-008/D-010/D-017; E-004/E-012.

### G. Admin repair

הזרימה: sources/users → detect drift → plan → approval/owner-direct → execute → browser/backend evidence → audit.

חוזקות: inspect/plan/execute יחסית מובחנים, וקיים custom dialog נגיש יותר.  
פערים: identity source, role mapping, “desired state”, self-approval, source conflict ו־post-write authority אינם מאושרים. Mongo ו־SharePoint אינם בהכרח מחזיקים אותה משמעות ל־admin. Severity P0; D-001/D-005–D-008; E-001/E-002/E-005.

### H. Auth ו־Job approval

ברירות המחדל בקוד: auth off, owner-direct on, advanced approvals off. `AUTH_ENABLED=false` יוצר Local Developer fallback. כאשר advanced approvals מופעלים, services מחזירים waiting approval ו־TTL; קיימות בדיקות self-approval/expiry.

הפער: שני mental models שונים מופעלים באותו UI. בלי environment banner, role contract ו־production decision, לא ניתן לדעת אם “Execute” פירושו “בצע עכשיו” או “שלח לאישור”. D-006/D-007 חוסמות את screen briefs של כל פעולה מסוכנת.

מלאי מכני: `workflow-inventory.csv`.

## 14. Audit RTL, מובייל ונגישות

### Responsive

| מסך | 390×844 | ממצא |
|---|---:|---|
| Dashboard | 6,136px | stacking ללא prioritization |
| Sites | 2,585px | touch targets צפופים |
| Site Overview | 7,894px | context לפני task |
| Site Recovery | 4,513px | workflow ארוך |
| Releases | 3,692px | controls רבים |
| Health | 3,445px | status density |
| Diagnostics | 5,544px | overflowX, scrollWidth 509 |
| Help | 23,829px | content dump |
| Settings | 10,069px | configuration dump |
| Analytics | 5,938px | overlap + overflowX, scrollWidth 514 |

ב־Tablet אין overflow אופקי במדגם, אך dashboard 4,584px, settings 4,676px, analytics 4,073px ו־site overview 4,097px. המערכת מגיבה באמצעות column stacking, אך אינה משנה content priority. Responsive אינו “הכל נכנס”; הוא צריך לשמר decision speed.

גורמי overflow מאומתים/חזקים:

- Analytics כולל line SVG עם `min-width: 38rem`, DataTables עד 980px, heatmap grids ו־scroll containers; ההכלה אינה מונעת page-level overflow בכל state.
- Diagnostics מציג URLs/paths, code rows ו־tables ארוכות. ה־LinkRow עצמו מנסה truncate, אך כל ה־composition עדיין חורג.
- Tables ללא `mobileCard` נשארות scrollable; כאשר cards קיימים, desktop table מוסתר.

### RTL

חוזקות: `dir=rtl`, logical spacing ו־text alignment עובדים ברוב המסכים; no major mirrored-layout failure בצילומים.  
פערים: English labels בתוך sentences, raw URLs/IDs ללא isolation policy, left/right semantics נקודתיים ב־tables, ו־detached experiments שאינם בוחנים אותו shell.

### Touch targets

במדידת mobile, רוב ה־controls בכמה מסכים מתחת ל־40px: Sites 57/64, Site Overview 46/48, Releases 32/62, Backups 24/26, Admins 18/19, Jobs 28/29, Analytics 93/104, Settings 30/33. זו בעיית interaction density מערכתית.

### Keyboard, focus ו־dialogs

| רכיב | semantics | focus trap | Escape | focus return | מסקנה |
|---|---|---|---|---|---|
| DetailsDrawer | כן | כן | כן | כן | בסיס טוב |
| SiteFormModal | לא | לא | לא | לא | P0 לזרימת create |
| ConfirmDialog | לא | לא | לא | לא | P1 |
| ProtectedActionDialog | לא | לא | לא | לא | P0 לפעולות מסוכנות |
| Admin access dialog | כן | כן | כן | כן/חלקי | דוגמה מקומית |

`SiteFormModal.tsx:1749-1801`, `ConfirmDialog.tsx:24-41`, `ProtectedActionDialog.tsx:52-109`. בדיקת focus חיה לא הושלמה בגלל timeout של browser tooling, אך החסר הסטטי חד־משמעי.

### Motion

אין keyframes משמעותיים, אין `transition: all`, וזה חיובי. עם זאת אין `prefers-reduced-motion` contract. מעברים קיימים צריכים להיכלל ב־accessibility baseline, גם אם המוצר אינו animation-heavy.

### נגישות תוכן

- contrast failures ב־subtle text;
- headings רבים ללא evidence שה־outline תומך במשימה;
- icon help buttons רבים;
- mixed terminology ו־small metadata;
- raw technical values;
- dialog gaps.

נדרש יעד WCAG 2.2 AA מאושר, ולא checklist נקודתי. Evidence E-008 חייב לכלול keyboard-only, VoiceOver/NVDA, zoom 200/400%, contrast ו־axe.

## 15. Audit ארכיטקטורת Frontend ו־CSS

### מבנה bundle

כל 17 הדפים מיובאים סטטית; אין `React.lazy`, `Suspense` או dynamic import. תוצאת build:

- JS: 1,048.71 kB minified, 276.90 kB gzip;
- CSS: 194.06 kB minified, 30.96 kB gzip;
- Vite warning על chunk מעל 500 kB;
- warning ש־hub-config script אינו bundled בלי `type=module`.

המשתמש משלם על Analytics, Labs ו־Northstar גם אם אינו נכנס אליהם. זהו גם risk של experiment leakage.

### מונוליתים

| קובץ | שורות | סימן ל־boundary חסר |
|---|---:|---|
| `ReleasesPage.tsx` | 2,754 | inventory + deploy + rollback + history |
| `SiteDetailsPage.tsx` | 2,420 | שמונה domains |
| `SiteFormModal.tsx` | 1,803 | שני workflows ו־13 controls |
| `AnalyticsDashboardPage.tsx` | 1,482 | filtering + six dashboards + charts |
| `BackupsPage.tsx` | 1,316 | six tabs |
| `SitesPage.tsx` | 1,265 | registry + workflow entry |
| `AdminsPage.tsx` | 1,237 | directory + drift + repair |
| `sitesApi.ts` | 2,829 | API surface אחד |

### CSS

- 10,671 שורות, 1,486 selectors, 1,484 unique.
- 11 media queries; 4 `!important`.
- 57 transition-property declarations, 25 values.
- 254 radii/20 values; 124 shadows/43 values.
- Design Studio CSS תופס את תחילת הקובץ, Labs ו־production באותו scope.
- אין CSS module/component boundary או design token enforcement.

### State ו־data loading

- `App` טוען health, auth bootstrap, me ו־SharePoint current user.
- `OperationalStatusProvider` טוען status ושומר localStorage cache.
- Routes טוענים 2–5 APIs באמצעות `Promise.all`.
- rate limiter הוא in-memory per-IP, 180/min (`server/src/middlewares/rate-limit.ts:15-49`).
- crawl של routes הפעיל 429; page Promise.all הפך response יחיד לכשל מסך מלא.

זו אינה רק מגבלת כלי audit: navigation/reload, כמה tabs או משתמשים מאחורי proxy משותף יכולים לצרוך bucket אחד. חסרים request dedupe, cache policy, partial rendering ו־retry contract ברמת planning.

### Boundary leakage

`SitePage` ו־Route components מנהלים browser SharePoint provisioning/deploy, connector evidence ו־API orchestration. `sharepointBrowserConnector` הוא כ־1,616 שורות. ה־UI מכיר low-level execution details; לכן wording ו־layout קשורים ישירות לארכיטקטורה.

### תכנית decomposition הנדרשת לפני coding

לא מדובר ב־sprint plan, אלא במפת גבולות:

1. domain state machines ל־site onboarding, release operation, recovery ו־access repair;
2. read models נפרדים ל־summary/details/evidence;
3. execution adapters ל־browser SharePoint ו־Builder Mongo;
4. policy service אחד ל־auth/approval/capabilities;
5. UI primitives מחייבים ל־action/evidence/state/dialog;
6. route manifest עם mode, role, priority, lazy boundary ו־ownership;
7. CSS/token packages לפי production מול experiments.

## 16. מפת אמינות הנתונים

| Domain/field | מקורות נוכחיים | freshness נוכחי | סיכון | החלטה נדרשת |
|---|---|---|---|---|
| Site identity | Hub registry + detected SharePoint/Mongo refs | metadata + detection | code/path/URL אינם entity contract אחד | D-005/D-009 |
| Storage backend | registry, detection, env default | יכול להיות unknown | כל ארבעת ה־fixtures unknown; fallback TXT | D-013 |
| Version | release registry, site metadata, runtime/read-back | mixed | “current” עלול להיות metadata בלבד | D-011 |
| Health | browser/backend probes, cached status, metadata | TTL משתנה | badges ללא authority אחיד | D-005 |
| Auth identity | SharePoint browser, backend `/me`, local fallback | session/runtime | dev identity יכול להחליף אמת production | D-006 |
| Admins | SharePoint groups, Mongo/Hub directory, desired plan | live/derived | conflict semantics לא מוגדרים | D-005/D-006 |
| Deploy readiness | release artifact, target snapshot, backup, connector | plan freshness | תנאים מפוזרים בין services/UI | D-007/D-011/D-012 |
| Backup | job metadata, artifact evidence, inventory | age/verify state | authority/retention/RPO חסרים | D-010 |
| Audit | DB events/reports/export | stored | retention/tamper/redaction לא הוכחו | D-017 |
| Operational status | provider API + localStorage cache | cached/live | shell ו־routes עשויים להציג זמנים שונים | D-005 |

### חוזה evidence הנדרש

כל ערך שמשפיע על פעולה צריך לשאת:

- source authority;
- captured-at ו־expires-at;
- method: live read / cached read / metadata / derived;
- operation/site correlation id;
- success/failure/partial;
- permissions/context;
- fallback reason;
- UI consequence: allowed, warning, blocked.

כיום חלק מן המאפיינים קיימים במקומות שונים, אך אין schema אחד ו־presentation contract אחד. זו הסיבה שהמערכת נזקקת לעשרות badges והסברים.

## 17. סיכוני מוצר ותפעול

| ID | חומרה | סיכון | טריגר | תוצאה | שורש | שער תכנון |
|---|---|---|---|---|---|---|
| K-01 | P0 | פעולה על מקור נתונים שגוי | storage/source unknown או stale | deploy/restore/admin write ליעד לא נכון | אין authority contract | D-005/D-013 + E-001/E-002 |
| K-02 | P0 | write ללא dual control מתאים | owner-direct/auth-off בייצור | שינוי מסוכן ללא הפרדת תפקידים | safety כ־config | D-006/D-007 + E-005 |
| K-03 | P0 | schedule שאינו יכול לרוץ | SharePoint browser-only + tab סגור | backup שלא נוצר למרות “enabled” | execution contract סותר UX | D-008/D-010 |
| K-04 | P0 | restore לא recoverable | artifact/retention/RPO לא מאושרים | אובדן שירות/מידע | backup authority חסר | D-010 + E-004 |
| K-05 | P0 | partially-created site נטוש | create נכשל בין registry/provision/deploy | אובייקט לא ברור וללא owner | אין shared state machine | D-009–D-013 |
| K-06 | P0 | פעולה מסוכנת לא נגישה | ProtectedActionDialog ללא focus contract | keyboard/screen-reader user אינו יכול לאשר בבטחה | primitive governance חסר | D-016 + E-008 |
| K-07 | P1 | 429 יפיל מסך שלם | route reload/fan-out/proxy bucket | אובדן אמון ו־partial availability | no loading resilience contract | E-013 |
| K-08 | P1 | מידע cached נראה current | shell ו־route timestamps שונים | החלטה על evidence ישן | no freshness presentation contract | D-005 |
| K-09 | P1 | החזרת SharePoint server write ישן | שימוש עתידי ב־env/docs/legacy client | עקיפת browser-only architecture | migration לא סגר surface | D-008/D-019 |
| K-10 | P1 | mobile workflow בלתי שמיש | מסמך ארוך, overlap, targets קטנים | טעויות/נטישה | stacking במקום prioritization | D-016 + E-014 |
| K-11 | P1 | experiment נתפס ככיוון מאושר | lab route בניווט או URL ישיר | training/QA/decisions על UI לא קנוני | no experiment lifecycle | D-003/D-020 |
| K-12 | P1 | אותה צפיפות חוזרת אחרי redesign | reuse של route monolith/global CSS | השקעה ויזואלית ללא rescue | boundaries/governance לא משתנים | סעיף 21 |
| K-13 | P2 | contrast/type regression | subtle token וטקסט זעיר | קריאות נמוכה | no type/contrast contract | D-015/D-016 |
| K-14 | P2 | bundle גדל ללא גבול | static imports ו־labs | startup איטי בסביבה סגורה | no performance budget | E-009/E-013 |

P0 כאן אינו אומר שכל נזק התרחש; הוא אומר שלא ניתן להכין rescue אמין בלי להכריע את הסיכון. כאשר הראיה production חסרה, הביטחון בהתרחשות הוא Unverified אך חומרת הכשל האפשרי נשארת P0.

## 18. Decision Register

הרשם המלא נמצא ב־`tmp/sitebuilder-hub-rescue-audit/decision-register.csv`. אין לבקש החלטות אלו באופן אד־הוק בזמן implementation; לכל אחת נדרשים owner, deadline, evidence וקישור ל־screen/workflow briefs.

| ID | החלטה | אפשרויות שיש להכריע | Owner מומלץ | חוסם |
|---|---|---|---|---|
| D-001 | Personas וסמכויות | Owner/Operator/Approver/Auditor/Developer | Product + Security | redesign + implementation |
| D-002 | הבטחת המוצר ו־top jobs | control plane / registry / observability | Product | redesign + implementation |
| D-003 | כיוון dashboard קנוני | current / candidate v2 / brief חדש | Product + Design | redesign |
| D-004 | IA ו־route set | task/domain/role based | Product + Design | שניהם |
| D-005 | authority/freshness | source per field + fallback rules | Product + Architecture | implementation |
| D-006 | Auth/RBAC | SharePoint identity / personal number / SSO | Security + Product | שניהם |
| D-007 | Approval/dual control | owner-direct / enforced approver / self-approval | Security + Operations | שניהם |
| D-008 | Browser-only execution | interactive only / trusted runner | Architecture + Operations | שניהם |
| D-009 | Site Collection ownership | Hub creates / external prerequisite | Platform Operations | implementation |
| D-010 | Backup/RPO/RTO | artifact store, retention, restore objectives | Operations + Security | שניהם |
| D-011 | Release/version authority | registry / metadata / runtime | Release Engineering | implementation |
| D-012 | Deploy semantics | replace/incremental, batch partial failure | Architecture + Release | שניהם |
| D-013 | Mongo transition/default | TXT / Mongo / explicit no-default | Product + Architecture | שניהם |
| D-014 | Language/terminology | Hebrew-first + approved technical glossary | Content Design | redesign |
| D-015 | Typography/density | font, scale, weights, minimums | Design + Accessibility | redesign |
| D-016 | Devices/accessibility | minimum viewport + WCAG 2.2 AA | Product + Accessibility | שניהם |
| D-017 | Audit retention/tamper | DB / immutable external archive | Security + Compliance | implementation |
| D-018 | Builder Admin boundary | Hub owns / handoff / deep-link | Product + Architecture | שניהם |
| D-019 | Production topology | origins, closed network, fonts, update channel | Platform Architecture | שניהם |
| D-020 | Experiment lifecycle | remove / gate / separate build / promote | Product + Engineering | שניהם |

### הכרעות שהדוח ממליץ לא לקבע ללא ראיה

- אין לבחור Candidate v2 רק מפני שהוא רגוע יותר; נדרש top-job test.
- אין להגדיר mobile כלא־נתמך רק כי המוצר תפעולי; נדרש usage/policy evidence.
- אין לבחור Mongo כברירת מחדל רק כי הוא הכיוון החדש; נדרש backend, release ו־recovery proof.
- אין להסיר evidence כדי להפחית צפיפות לפני שנקבע מה חייב להופיע לפני action.
- אין להסיק ש־owner-direct הוא production policy מן ה־local default.

## 19. Missing Evidence Register

| ID | ראיה נדרשת | מה היא תכריע | מצב |
|---|---|---|---|
| E-001 | workflow מלא מול SharePoint TXT אמיתי | digest, permissions, paths, browser evidence | חסר |
| E-002 | workflow מלא מול Builder Mongo backend | registry, collection, seed, health, backup | חסר |
| E-003 | deploy + rollback drill ל־TXT/Mongo | safety, read-back, partial failure | לא בוצע |
| E-004 | backup + restore drill ל־TXT/Mongo | artifact authority ו־RPO/RTO | לא בוצע |
| E-005 | חשבונות RBAC/approval מייצגים | role visibility, denial, self-approval | local owner בלבד |
| E-006 | fleet production והתפלגות data quality | priorities, migration scale, unknown storage | fixture של 4 sites בלבד |
| E-007 | interviews/task frequency/support failures | personas, top jobs, content removal | לא סופק |
| E-008 | axe + keyboard + screen reader + zoom | WCAG baseline | חסר |
| E-009 | closed-network performance/font run | startup budget ו־type rendering | build מקומי בלבד |
| E-010 | browser compatibility matrix | connector ו־UI support | Chromium in-app בלבד |
| E-011 | כל modal/error/blocked/stale/unknown screenshots | complete state briefs | חלקי |
| E-012 | logging/retention/redaction/tamper proof | compliance/incident response | חסר |
| E-013 | realistic load/rate-limit test | fan-out, proxy bucket, retry | crawl מקומי חשף 429 |
| E-014 | mobile usage + minimum viewport policy | priority/severity של mobile | חסר |
| E-015 | content owner + approved glossary | prevention of copy/help regrowth | חסר |

כל פריט מתועד עם owner role ו־blocking consequence ב־`missing-evidence-register.csv`. העובדה שראיה חסרה אינה “פער לא מוסבר”: מקור החסר, השפעתו והשער שבו היא נדרשת מתועדים.

## 20. Rescue Planning Readiness Score

הציון מתאר את מוכנות המוצר להתחיל rescue בטוח, לא את איכות הדוח. ממוצע משוקלל שווה: **44/100**.

| תחום | ציון | למה | מה חסר | מה יהפוך למוכן |
|---|---:|---|---|---|
| Product definition | 35 | יכולות רבות, הבטחה לא אחת | D-002/D-018 | brief מאושר עם top jobs/non-goals |
| User roles | 30 | roles מרומזים בקוד | D-001/D-006/D-007 | role-permission-task matrix + accounts |
| Information architecture | 38 | routes מלאים אך חופפים | D-003/D-004/D-020 | route manifest ו־nav model מאושרים |
| Workflow clarity | 55 | plans/gates קיימים | state machines ו־real drills | maps + success/failure contracts |
| Content strategy | 42 | help coverage רחב | owner, tiers, glossary | content model/removal budget |
| Typography | 38 | tokens בסיסיים | scale/contrast/font decision | typography spec + target rendering |
| Design system | 42 | components/tokens קיימים | enforced semantics/variants | foundations + governance |
| Responsive behavior | 35 | media queries ו־stacking | priorities, device policy, failures | viewport contract + route briefs |
| Accessibility | 30 | drawer טוב ו־labels רבים | dialogs, contrast, AT evidence | WCAG contract + baseline |
| Operational trust | 50 | evidence/gates עשירים | authority, auth, restore proof | approved trust model + drills |
| Frontend architecture | 38 | TypeScript/components | monoliths, bundle, CSS, orchestration | approved boundary map |
| Runtime evidence | 60 | full local crawl/screenshots | real connectors/production data | E-001–E-006/E-009 |
| Test confidence | 55 | 267 tests passing | no browser/a11y/E2E | layered QA baseline |
| Implementation sequencing | 68 | dependencies כעת ממופות | owners/dates/approvals | close DoR gates in order |

איכות תמונת התכנון עצמה היא 92/100, משום שהפערים הנותרים רשומים ואינם סמויים. אין לבלבל בין “הדוח יודע מה חסר” לבין “המוצר מוכן ליישום”.

## 21. Definition of Ready

מותר להתחיל redesign/implementation רחב רק כאשר כל השערים הבאים מסומנים ומקושרים לראיה:

### Gate A — Product

- D-001/D-002 מאושרות: personas, top three jobs, non-goals ו־success metrics.
- D-018 מאושרת: מה נשאר ב־Builder Admin ומה ה־Hub מחליף.
- primary action ו־risk class לכל Route מאושרים.

### Gate B — IA ומודים

- D-003/D-004/D-020 מאושרות.
- route manifest כולל mode, audience, role, owner, priority, lifecycle ו־lazy/build boundary.
- Normal/Help/Diagnostics/Lab contract מאושר.
- query/deep-link/legacy mapping מתועד.

### Gate C — Data trust

- field-level authority/freshness matrix מאושרת.
- evidence schema אחיד מוגדר.
- Unknown/Stale/Failed/Partial semantics ו־UI consequences מאושרים.
- storage migration/default policy מאושרת.

### Gate D — Safety ו־operations

- Auth/RBAC/approval/dual-control policy מאושרת.
- browser-only/unattended execution contract מאושר.
- backup store, retention, RPO/RTO ו־restore ownership מאושרים.
- release/version/deploy/rollback semantics מאושרים.
- audit retention/tamper/redaction מאושרים.

### Gate E — Workflow maps

לכל Add Existing, Create TXT, Create Mongo, Deploy, Rollback, Backup, Restore ו־Admin Repair קיימים:

- state/event/actor diagram;
- prerequisites ו־validation timing;
- allowed/blocked/retry/resume/cancel/partial/cleanup states;
- write boundary;
- success evidence;
- owner של partially-completed work;
- safe copy ואישור של Risk/Compliance.

### Gate F — Content וטיפוגרפיה

- glossary עברי־טכני מאושר ו־content owner מוגדר.
- content tiers ו־first-viewport budgets מאושרים.
- type scale, font, weight, bidi, contrast ו־minimum sizes מאושרים.
- help/diagnostics content routing מאושר.

### Gate G — Design system

- foundations ל־surface/spacing/radius/type/status/action מאושרים.
- evidence/freshness, dialog, form/stepper, table/mobile ו־empty/error/blocked primitives מוגדרים.
- density ו־touch target rules מאושרים.
- review/lint/story acceptance process מוגדר כדי למנוע divergence.

### Gate H — Architecture

- domain state machines/read models/adapters boundaries מאושרים.
- API loading, cache, dedupe, retry, partial rendering ו־rate-limit contract מאושר.
- route/code-splitting ו־experiment packaging מאושרים.
- migration/deprecation map ל־legacy SharePoint server code/env מאושר.

### Gate I — Evidence ו־QA baseline

- E-001–E-005 מבוצעים בסביבה בטוחה.
- E-006/E-007 מספקים route priority.
- E-008–E-010 קובעים accessibility/device/performance baseline.
- screenshot baseline לכל route, critical state, theme ו־viewport מאושר.
- test pyramid כולל unit/domain, API contract, browser E2E, visual, accessibility ו־real connector drills.

ה־DoR אינו דורש שהמוצר כבר יהיה מתוקן. הוא דורש שכל החלטה שתשנה מבנה, copy, state או boundary תהיה מאושרת וניתנת לבדיקה.

## 22. Recommended Next Planning Sequence

זהו רצף השלמת תכנון, לא coding sprint plan.

1. **ממנים Product Authority ו־Decision owners.** בלי owner, כל הסעיפים הבאים יהפכו שוב לדוחות ללא הכרעה.
2. **מאשרים personas, top jobs וגבול Builder.** אלה קובעים מהו מוצר ומהו support/legacy.
3. **מאשרים Data Trust ו־Safety contracts.** IA ו־workflows אינם בטוחים לפני שיודעים מה אמת ומי רשאי לפעול.
4. **מכריעים browser-only, scheduling, backup ו־Mongo transition.** אלה משנים את עצם יכולת הביצוע, לא רק UI.
5. **מריצים את E-001–E-005 בסביבה מבוקרת.** החלטות ארכיטקטורה חייבות להיבדק מול connectors והרשאות אמיתיים.
6. **מאשרים UI mode contract, route manifest ו־dashboard direction.** כעת אפשר להסיר overlap ולהפריד Labs/Diagnostics.
7. **מאשרים workflow state machines.** רק לאחר authority/safety אפשר להגדיר progression, blocked, partial ו־ready.
8. **מאשרים content model, glossary וטיפוגרפיה.** הם נשענים על jobs/states, וקובעים density אמיתית.
9. **מאשרים design-system foundations ו־frontend boundary map.** primitives צריכים לייצג contracts שכבר הוכרעו.
10. **מפיקים route-by-route redesign briefs ו־QA baselines.** כל brief כולל state matrix, viewport, evidence, copy budget ו־acceptance proof.
11. **רק אז יוצרים implementation roadmap.** sequencing טכני ייגזר מתלויות domain ו־migration, לא מסדר המסכים ב־Sidebar.

## 23. Appendix

### פקודות מרכזיות

- `git status --short`, `git rev-parse HEAD`, `git log`
- `rg --files docs mds`, `wc -l`
- `npm test`
- `npm run build`
- `rg` למלאי Routes, components, API, env, status enums, CSS ו־tests
- הרצת server/client מקומיים ובדיקת `/api/health`, `/api/sites` ו־routes
- Browser DOM inspection, viewport switching וצילומי full-page
- contrast calculations ו־CSS census

לא הודפסו ערכי secrets; נסרקו שמות keys בלבד.

### Test/build

- 62 test files, 267 tests passed, 1.35s.
- server/client build passed.
- אין browser/a11y test framework.
- JS 1,048.71 kB minified / 276.90 kB gzip.
- CSS 194.06 kB minified / 30.96 kB gzip.
- פרטים: `tmp/sitebuilder-hub-rescue-audit/test-build-results.md`.

### Inventories

- Routes ומדידות: `route-metrics.csv`
- מסכים: `screen-inventory.csv`
- Workflows: `workflow-inventory.csv`
- Decisions: `decision-register.csv`
- Missing evidence: `missing-evidence-register.csv`
- Frontend complexity: `frontend-complexity.csv`
- Historical reconciliation: `historical-report-reconciliation.csv`
- Screenshot index: `screenshot-index.csv`
- Screenshots: `screenshots/`

### רכיבים ו־קבצים

- `SectionCard` כ־75 שימושים; `KpiCard` 54; `LinkRow` 58; `DataTable` 34; `EmptyState` 45; `DetailsDrawer` 11.
- קבצים גדולים: Releases 2,754; Site Details 2,420; SiteFormModal 1,803; Analytics 1,482; Backups 1,316; Sites 1,265; Admins 1,237; `sitesApi` 2,829.
- `index.css`: 10,671 שורות, 1,486 selectors, 69 font sizes, 20 radii, 43 shadows.

### צילומי מפתח

- Production dashboard: `screenshots/01-dashboard-desktop-light.png`
- Full production dashboard: `screenshots/02-dashboard-desktop-light-full.png`
- Site Overview desktop/mobile: `18-site-details-overview-desktop-light.png`, `40-mobile-site-overview-light.png`
- Analytics desktop/mobile: `14-analytics-desktop-light.png`, `50-mobile-analytics-light.png`
- Diagnostics mobile: `47-mobile-diagnostics-light.png`
- Help mobile: `48-mobile-help-light.png`
- Candidate: `15-dashboard-lab-desktop-light.png`, `51-mobile-dashboard-candidate-light.png`
- Design Studio/Northstar: `16...`, `17...`, `52...`, `53...`
- Dark production: `54-desktop-dashboard-dark.png`, `55-desktop-sites-dark.png`, `56-desktop-site-overview-dark.png`.

צילומים `67`–`70` כוללים את error state של rate limit ואינם baseline אמין למסך היעד. אין `71`; capture נכשל.

### Console/runtime

- Mongo container הפסיק במהלך הסבב והוחזר; API התאושש. זהו environment instability, לא הוכחה לבאג מוצר.
- ניסיון מוקדם דרך `127.0.0.1` יצר CORS warning; הנתיב הרגיל `localhost:5177` עבד.
- crawl מקיף יצר 429 “נחסמת זמנית בשל עומס בקשות”.
- page loads מרובים נכשלו בשל `Promise.all` כאשר קריאה אחת נחסמה.
- השרת המקומי יצר אוטומטית רשומות Audit עבור בקשות/שגיאות בזמן הקריאה. לא נוצרה ביוזמת הביקורת פעולת Site, Release, Job, Deploy, Backup, Restore או Admin; זהו side effect של observability במסד המקומי בלבד.

### אזורים לא מאומתים

ראו E-001–E-015. בנוסף, לא בוצעו mutation flows, לא נסקרו assistive technologies, ולא אושרו production topology או mobile support.

### אתגור עצמי סופי

**מה ייתכן שפספסתי?** לא נשאר Route או Site tab לא ממופה. ייתכנו permutations של filters, errors ו־permissions שלא הופקו; הם מופיעים ב־E-005/E-011 ולא מוצגים כמאומתים.

**אילו טענות הן assumptions?** הפרסונות, תדירות השימוש, חשיבות mobile, production storage, network topology ו־content ownership. כל אחת קשורה להחלטה או evidence ID.

**אילו states לא נבדקו חזותית?** mutation success/failure, real browser evidence, approver denial, partially-created recovery, restore failure, חלק מ־dark mobile, Monitoring/Audit mobile מלא. הם אינם משנים את גורמי השורש, אך חוסמים screen briefs סופיים.

**אילו בעיות הן סימפטומים?** cards, badges, text density, long scroll, mixed terminology ו־help icons. השורשים הם authority, trust, safety, mode governance ו־frontend boundaries.

**מה עדיין יידרש לצוות implementation?** Decision register סגור, state machines, authority matrix, real connector evidence, component contracts, route briefs ו־QA baselines — כולם מוגדרים ב־DoR.

**האם הכשלים יחזרו אחרי redesign חזותי?** כן, בוודאות גבוהה, אם יישארו אותם route monoliths, data ambiguity, configurable safety, content ownership חסר ו־Labs בתוך bundle/IA.

**האם נשאר פער תכנון חומרי בלתי מוסבר?** לא. נשארו החלטות וראיות חסרות, אך לכל אחת סיבה, owner מומלץ, consequence ושער. לכן דוח זה יכול לשמש מקור סמכות להכנת אסטרטגיית ההצלה וה־roadmap, בלי לטעון שהמוצר כבר מוכן ליישום.

</div>
