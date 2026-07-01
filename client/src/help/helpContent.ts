export type HelpContentItem = {
  key: string;
  title: string;
  description: string;
  fix?: string;
  anchor?: string;
};

export const helpContent = {
  "hub.overview": {
    key: "hub.overview",
    title: "מה זה ה־Hub",
    description: "שכבת ניהול מרכזית לאתרי Site Builder רבים. ה־Hub שומר registry, מציג מצב, מתכנן פעולות ומרכז ראיות, אבל האתר עצמו עדיין חי ב־SharePoint.",
    fix: "אם מידע נראה חסר, בדקו האם הוא נשמר ב־Mongo בלבד או נמשך עכשיו מ־SharePoint.",
    anchor: "what-is"
  },
  "dashboard.page": {
    key: "dashboard.page",
    title: "דשבורד",
    description: "מסך תמונת מצב שמרכז אתרים שדורשים טיפול, Jobs שנכשלו, סטטוס תקינות, גרסאות מיושנות וגבולות אמינות של הנתונים.",
    fix: "אם מספר נראה לא מעודכן, רעננו את המסך או הריצו בדיקת Health/Diagnostics לאתר הרלוונטי.",
    anchor: "capabilities"
  },
  "sites.registry": {
    key: "sites.registry",
    title: "רשימת אתרים / Registry",
    description: "רשימת האתרים שה־Hub מכיר ומנהל. זו רשומת ניהול ב־Mongo, לא הוכחה שכל אתר SharePoint זמין כרגע.",
    fix: "אם אתר חסר או לא נכון, עדכנו את הרשומה או הריצו בדיקת קריאה מול SharePoint.",
    anchor: "sites"
  },
  "site.active": {
    key: "site.active",
    title: "אתר פעיל",
    description: "אתר שנכלל בעבודה השוטפת: ניטור, בדיקות, תכנון גיבויים ופריסות לפי הרשאות.",
    anchor: "sites"
  },
  "site.archived": {
    key: "site.archived",
    title: "ארכיון",
    description: "אתר שנשמר להיסטוריה אבל לא אמור להשתתף כברירת מחדל בפריסות ובפעולות רוחב.",
    fix: "אם אתר בארכיון צריך לחזור לעבודה, שחזרו אותו מרשימת האתרים לפני תכנון פעולה.",
    anchor: "sites"
  },
  "site.code": {
    key: "site.code",
    title: "קוד אתר",
    description: "מזהה קצר ויציב שמשמש לגזירת נתיבי SharePoint, כתובת האתר, תיקיות Site Builder ודוחות.",
    fix: "אם נתיב מחושב נראה שגוי, בדקו קודם את קוד האתר ואת כתובת SharePoint.",
    anchor: "sites"
  },
  "site.environment": {
    key: "site.environment",
    title: "סביבה",
    description: "הקשר התפעול של האתר, למשל dev, test, staging או production. הסביבה משפיעה על רמת הזהירות, גיבויים ואישורים.",
    anchor: "sites"
  },
  "site.sharepointUrl": {
    key: "site.sharepointUrl",
    title: "כתובת SharePoint",
    description: "כתובת אתר SharePoint שעליו האתר יושב. ממנה נגזרים רוב נתיבי הקריאה, הגיבוי והפריסה.",
    fix: "אם מתקבל 404 או נתיב לא נמצא, ודאו שהכתובת מובילה לאתר הנכון ושקוד האתר מתאים.",
    anchor: "sites"
  },
  "site.finalDistPath": {
    key: "site.finalDistPath",
    title: "Final dist path",
    description: "התיקייה ב־SharePoint שאליה קבצי האפליקציה הסופיים אמורים להגיע בזמן Deploy.",
    fix: "אם האתר נפתח בלי גרסה חדשה, בדקו שה־dist הנכון נפרס לנתיב הזה וש־index.html קיים.",
    anchor: "sites"
  },
  "site.connectorMode": {
    key: "site.connectorMode",
    title: "מצב מחבר",
    description: "הדרך שבה ה־Hub מקבל נתונים או מבצע פעולה: דפדפן מחובר ל־SharePoint, שרת מקומי, או מטא־דאטה שנשמר ב־Mongo.",
    fix: "אם הדפדפן מחובר אבל השרת נכשל, פתחו בעיות וחיבורים ובדקו Backend connector ו־Digest.",
    anchor: "sharepoint"
  },
  "site.metadata": {
    key: "site.metadata",
    title: "נתוני מטא בלבד",
    description: "מידע שנשמר ב־Hub ואינו בהכרח נמשך עכשיו מ־SharePoint. הוא שימושי לניהול, אבל לא מחליף בדיקת חיבור חיה.",
    anchor: "sites"
  },
  "site.cached": {
    key: "site.cached",
    title: "מידע שמור",
    description: "Snapshot קודם שנשמר ב־Mongo. טוב להשוואה ולתצוגה מהירה, אבל יכול להיות ישן.",
    fix: "כדי לקבל אמת עדכנית, הריצו Live read או Health check.",
    anchor: "admins"
  },
  "site.mongodb": {
    key: "site.mongodb",
    title: "Mongo snapshot",
    description: "עותק נתונים שנשמר במסד הנתונים של ה־Hub. הוא מאפשר לראות היסטוריה גם כש־SharePoint לא זמין.",
    anchor: "admins"
  },
  "site.addExisting": {
    key: "site.addExisting",
    title: "הוספת אתר קיים",
    description: "מסלול שמוסיף אתר שכבר קיים ל־registry ומריץ בדיקות קריאה בלבד. הוא לא יוצר ספריות, קבצים או הרשאות.",
    fix: "אם הבדיקה נכשלת אחרי השמירה, בדקו כתובת SharePoint והרשאות קריאה.",
    anchor: "track-existing"
  },
  "site.createNew": {
    key: "site.createNew",
    title: "יצירת אתר חדש",
    description: "מסלול תכנון והקמה לאתר Site Builder חדש: פרטי אתר, בעלים, נתיבים, תוכנית, Provision, הרשאות ואימות.",
    fix: "אם ההקמה נחסמת, בדקו חיבור Backend ל־SharePoint, הרשאות בעלים ונתיבי יעד.",
    anchor: "create-new"
  },
  "create.displayName": {
    key: "create.displayName",
    title: "שם האתר",
    description: "השם העסקי שמופיע ב־HUB, בדוחות וב־Audit. הבעלים ממלא אותו ידנית כדי שאנשים יזהו את האתר.",
    fix: "אם השם חסר, אי אפשר ליצור רשומה ברורה. הזינו שם כמו: פורטל משאבי אנוש.",
    anchor: "create-mongo-site"
  },
  "create.siteCode": {
    key: "create.siteCode",
    title: "קוד אתר / נתיב SharePoint",
    description: "שם לוגי קצר שעוזר לבנות נתיבי SharePoint. הוא לא מזהה אתר באופן יחיד; יכולים להיות כמה אתרים עם אותו קוד אם היעדים הפיזיים שונים.",
    fix: "אם הנתיבים המחושבים שגויים, בדקו את הקוד ואת כתובת SharePoint. דוגמה: alphateam.",
    anchor: "create-mongo-site"
  },
  "create.builderSiteId": {
    key: "create.builderSiteId",
    title: "מזהה אתר במערכת Site Builder",
    description: "המזהה שה־Frontend וה־Backend משתמשים בו מול ה־API, למשל בקריאות /api/sites/:siteId. באתר Mongo הוא חייב להתאים ל־runtime config ולרשומת האתר ב־Mongo.",
    fix: "אם המזהה שגוי, האתר יעלה אבל יטען נתונים של אתר אחר או לא יטען נתונים בכלל.",
    anchor: "create-mongo-site"
  },
  "create.description": {
    key: "create.description",
    title: "תיאור",
    description: "טקסט קצר שעוזר להבין למה האתר קיים. הוא לא משפיע על פריסה, Mongo או SharePoint.",
    anchor: "create-mongo-site"
  },
  "create.environment": {
    key: "create.environment",
    title: "סביבת יעד",
    description: "הסביבה התפעולית של האתר: dev, test, staging או production. היא עוזרת להבין רמת זהירות, גיבויים ואישורים.",
    fix: "אם לא בטוחים, השאירו unknown ועדכנו לפני עבודה בסביבת production.",
    anchor: "create-mongo-site"
  },
  "create.unitName": {
    key: "create.unitName",
    title: "יחידה",
    description: "שם היחידה או הצוות שמחזיקים באתר. זה שדה ניהולי לחיפוש ודוחות, לא נתיב טכני.",
    anchor: "create-mongo-site"
  },
  "create.storageBackend": {
    key: "create.storageBackend",
    title: "סוג אחסון נתונים",
    description: "קובע איפה נשמרים נתוני האתר. באתר Mongo, SharePoint מארח את הקבצים אבל הנתונים החיים נשמרים דרך Builder backend.",
    fix: "אם בוחרים TXT legacy בטעות, האתר לא יקבל runtime config של Mongo ולא יעבוד מול Builder backend.",
    anchor: "create-mongo-site"
  },
  "create.status": {
    key: "create.status",
    title: "סטטוס",
    description: "מצב ניהול הרשומה ב־HUB. ביצירת אתר חדש המערכת מתחילה מטיוטה כדי לא לסמן אתר לא מוכן כפעיל.",
    anchor: "create-mongo-site"
  },
  "create.version": {
    key: "create.version",
    title: "גרסה נוכחית",
    description: "הגרסה שה־HUB יודע שהאתר נמצא עליה. ביצירת אתר חדש זה בדרך כלל ערך התחלתי ולא הוכחה ש־dist נפרס.",
    anchor: "create-mongo-site"
  },
  "create.notes": {
    key: "create.notes",
    title: "הערות",
    description: "הערות ניהוליות פנימיות. הן לא נשלחות ל־SharePoint, Mongo או runtime config.",
    anchor: "create-mongo-site"
  },
  "create.ownerName": {
    key: "create.ownerName",
    title: "שם בעל האתר",
    description: "האדם האחראי עסקית ותפעולית על האתר. השם משמש לתצוגה ולמעקב.",
    anchor: "create-mongo-site"
  },
  "create.ownerPersonalNumber": {
    key: "create.ownerPersonalNumber",
    title: "מספר אישי של בעל האתר",
    description: "מזהה פנימי שמאפשר לאתחל בעלים ומנהלים בצורה עקבית. באתר Mongo הוא נכנס גם ל־seed docs של המשתמשים.",
    fix: "אם חסר מספר אישי, האתר עלול להיווצר בלי בעלים מזוהה לניהול ראשוני.",
    anchor: "create-mongo-site"
  },
  "create.ownerEmail": {
    key: "create.ownerEmail",
    title: "מייל בעל האתר",
    description: "משמש לבעלות, הרשאות ראשוניות ויצירת אתר SharePoint כאשר הפעולה זמינה. זה אינו API key.",
    fix: "אם המייל שגוי, בעל האתר לא יקבל הרשאות או לא יזוהה נכון.",
    anchor: "create-mongo-site"
  },
  "create.ownerPhone": {
    key: "create.ownerPhone",
    title: "טלפון",
    description: "פרט קשר ניהולי לבעל האתר. לא משפיע על יצירה, פריסה או runtime config.",
    anchor: "create-mongo-site"
  },
  "create.initialAdmins": {
    key: "create.initialAdmins",
    title: "מנהלים ראשוניים",
    description: "רשימת האנשים שיקבלו ניהול התחלתי. באתר Mongo הרשימה נזרעת ל־users_data.txt בתוך seed docs.",
    fix: "אם הרשימה ריקה וגם אין בעל אתר תקין, האתר ייווצר בלי מנהל ברור.",
    anchor: "create-mongo-site"
  },
  "create.sharePointSiteUrl": {
    key: "create.sharePointSiteUrl",
    title: "כתובת אתר SharePoint",
    description: "המיקום שבו קבצי האתר יתארחו. זו שכבת האירוח, לא המקום שבו נתוני Mongo נשמרים.",
    fix: "אם הכתובת שגויה, runtime config, dist והקישור הסופי יחושבו למקום הלא נכון.",
    anchor: "create-mongo-site"
  },
  "create.finalAppUrl": {
    key: "create.finalAppUrl",
    title: "קישור סופי לאתר",
    description: "הכתובת שממנה המשתמשים יפתחו את האתר אחרי הפריסה. בדרך כלל זו כתובת index.html בתוך dist.",
    fix: "אם הקישור שגוי, המשתמשים יגיעו לדף לא קיים או לגרסה לא נכונה. המערכת צריכה לאמת שהקישור נטען לפני ready.",
    anchor: "create-mongo-site"
  },
  "create.siteDbLibrary": {
    key: "create.siteDbLibrary",
    title: "ספריית siteDB",
    description: "ספריית SharePoint שבה יושבים קבצי האירוח של האתר, למשל dist, assets וקבצי תאימות. באתר Mongo הנתונים החיים לא נשמרים כאן.",
    fix: "אם הספרייה שגויה, פריסה ובדיקות Health יחפשו קבצים במקום הלא נכון.",
    anchor: "create-mongo-site"
  },
  "create.usersDbLibrary": {
    key: "create.usersDbLibrary",
    title: "ספריית siteUsersDb",
    description: "ספריית SharePoint היסטורית למידע משתמשים/מנהלים. באתר Mongo מקור האמת עשוי להיות Mongo, אבל הספרייה עדיין חשובה לתאימות והרשאות.",
    fix: "אם הספרייה שגויה, תאימות users_data והרשאות עלולות להיבדק ביעד לא נכון.",
    anchor: "create-mongo-site"
  },
  "create.bootstrapLibrary": {
    key: "create.bootstrapLibrary",
    title: "ספריית Bootstrap",
    description: "ספריית SharePoint שבה אפשר להניח קבצי הקמה או דף עזר לפני שהאתר הסופי מוכן. זה לא האתר הסופי.",
    anchor: "create-mongo-site"
  },
  "create.bootstrapFolder": {
    key: "create.bootstrapFolder",
    title: "תיקיית Bootstrap",
    description: "תיקייה זמנית/ראשונית לקבצי עזר של ההקמה. ברירת המחדל נוצרת אוטומטית ולא דורשת החלטת בעלים.",
    anchor: "create-mongo-site"
  },
  "create.runtimeConfigPath": {
    key: "create.runtimeConfigPath",
    title: "נתיב runtime config",
    description: "קובץ ההגדרות שהאתר קורא בזמן טעינה. באתר Mongo הוא אומר ל־Frontend לעבוד מול Mongo backend ומכיל siteId, backendApiUrl והפניה להרשאה.",
    fix: "בלי הקובץ הזה האתר לא יודע מאיפה לטעון נתונים. השאירו ריק לברירת מחדל בתוך dist או הזינו נתיב SharePoint תקין.",
    anchor: "create-mongo-site"
  },
  "create.backendApiUrl": {
    key: "create.backendApiUrl",
    title: "כתובת Backend של Site Builder",
    description: "השרת שמולו האתר עובד כדי לקרוא ולשמור נתונים ב־Mongo. זו לא כתובת SharePoint.",
    fix: "אם הכתובת לא זמינה או לא מורשית, האתר יעלה אבל לא יוכל לטעון נתונים.",
    anchor: "create-mongo-site"
  },
  "create.credentialRef": {
    key: "create.credentialRef",
    title: "הפניה להרשאת API",
    description: "שם של הגדרה שמחזיקה את מפתח ה־API ל־Builder backend. לא מזינים כאן את המפתח עצמו כדי לא לחשוף סודות במסך, בלוגים או ב־Audit.",
    fix: "אם ההפניה חסרה או מצביעה למשתנה לא קיים, ה־HUB לא יוכל ליצור registry או seed docs.",
    anchor: "create-mongo-site"
  },
  "create.safeCollectionName": {
    key: "create.safeCollectionName",
    title: "שם Collection במונגו",
    description: "שם ה־collection הפיזי שבו יישמרו נתוני האתר במונגו. בדרך כלל המערכת יכולה ליצור אותו לבד.",
    fix: "שינוי ידני מיועד למצבים מתקדמים בלבד. אם הערך שגוי, האתר עלול להצביע ל־collection לא נכון או להיחסם בבדיקת התאמה.",
    anchor: "create-mongo-site"
  },
  "create.mongoEnvironment": {
    key: "create.mongoEnvironment",
    title: "סביבת Mongo",
    description: "מידע תיעודי על סביבת Mongo שמאחורי Builder backend. לרוב נקבע בצד השרת ולא על ידי בעל האתר.",
    anchor: "create-mongo-site"
  },
  "create.mongoDatabase": {
    key: "create.mongoDatabase",
    title: "מסד נתונים Mongo",
    description: "שם מסד הנתונים בצד Builder backend. בדרך כלל לא צריך למלא ידנית באשף.",
    anchor: "create-mongo-site"
  },
  "create.widgetsMapping": {
    key: "create.widgetsMapping",
    title: "מיקום widgets_data.txt",
    description: "מיפוי תאימות לקובץ legacy. באתר Mongo הנתונים נשמרים כ־seed docs, אבל עדיין צריך לדעת מאיזה שם קובץ הם הגיעו.",
    fix: "בחירה לא נכונה עלולה לגרום למיפוי widgets להיקרא מהספרייה הלא נכונה.",
    anchor: "create-mongo-site"
  },
  "create.sharePointConnector": {
    key: "create.sharePointConnector",
    title: "מחבר SharePoint",
    description: "מציג האם פעולה מול SharePoint תרוץ דרך הדפדפן המחובר או שהיא עדיין לא הוסבה.",
    fix: "אם פעולה חסומה, בדקו שהדפדפן מחובר ל־SharePoint או שהפעולה כבר ממומשת במסלול דפדפן.",
    anchor: "create-mongo-site"
  },
  "site.bootstrap": {
    key: "site.bootstrap",
    title: "Bootstrap / Provision",
    description: "הכנת מבנה Site Builder ב־SharePoint: ספריות, תיקיות, קבצי TXT/JSON ראשוניים וסימוני הרשאות.",
    fix: "כשל Bootstrap בדרך כלל מצביע על הרשאות SharePoint, נתיב שגוי או חוסר ביכולת כתיבה.",
    anchor: "create-new"
  },
  "site.owner": {
    key: "site.owner",
    title: "בעל האתר",
    description: "האדם האחראי עסקית ותפעולית על האתר. הוא משמש גם לאתחול מנהלים ולהחלטות שינוי משמעותיות.",
    anchor: "admins"
  },
  "site.admins": {
    key: "site.admins",
    title: "מנהלים",
    description: "אנשים או זהויות שמנהלים אתר. ה־Hub משווה בין TXT admins, Site Collection Admins ו־Owners Group כדי למצוא פערים.",
    fix: "אם מנהל חסר רק במקור אחד, הריצו Live read ואז Plan לתיקון TXT או פעולה מוגנת מול SharePoint.",
    anchor: "admins"
  },
  "site.txtAdmins": {
    key: "site.txtAdmins",
    title: "TXT admins",
    description: "מנהלים שמופיעים בקובץ users_data.txt או ב־snapshot שלו. זה מקור חשוב לאפליקציית Site Builder.",
    anchor: "admins"
  },
  "site.siteCollectionAdmins": {
    key: "site.siteCollectionAdmins",
    title: "Site Collection Admins",
    description: "מנהלי SharePoint ברמת האתר כולו. שינוי שלהם הוא פעולה שמשנה הרשאות ב־SharePoint.",
    fix: "אם כתיבה נכשלת, הריצו את הפעולה בדפדפן פעיל מול SharePoint ובדקו ש־Digest תקין.",
    anchor: "admins"
  },
  "site.ownersGroup": {
    key: "site.ownersGroup",
    title: "Owners Group",
    description: "קבוצת הבעלים המשויכת לאתר SharePoint. היא משפיעה על מי יכול לנהל תוכן והרשאות באתר.",
    anchor: "admins"
  },
  "site.adminLiveRead": {
    key: "site.adminLiveRead",
    title: "Admin live read",
    description: "קריאה חיה של מקורות מנהלים מתוך SharePoint דרך הדפדפן. היא לא משנה הרשאות ולא כותבת קבצים.",
    fix: "אם הקריאה נכשלת, ודאו שהדפדפן מחובר ל־SharePoint ושהאתר פתוח באותו tenant.",
    anchor: "admins"
  },
  "site.adminSync": {
    key: "site.adminSync",
    title: "Admin sync",
    description: "שמירת תוצאת קריאת המנהלים כ־snapshot ב־Mongo, כדי שיהיה בסיס להשוואה ולדוחות.",
    anchor: "admins"
  },
  release: {
    key: "release",
    title: "Release",
    description: "גרסה ניהולית של האפליקציה. Release מחזיק מספר גרסה, הערות ו־Artifact, אבל יצירתו לא פורסת שום קובץ בעצמה.",
    fix: "כדי לפרוס Release צריך Artifact תקין, Dry-run ויכולת כתיבה ל־SharePoint.",
    anchor: "deploy"
  },
  artifact: {
    key: "artifact",
    title: "Artifact",
    description: "תיקיית dist או manifest שמכילים את הקבצים שייפרסו ל־SharePoint. בלי Artifact אין מה להעלות.",
    fix: "אם Artifact חסר, חברו נתיב dist אמיתי או sharepoint-deploy-manifest.json והריצו Validate.",
    anchor: "deploy"
  },
  "artifact.validation": {
    key: "artifact.validation",
    title: "Validation",
    description: "בדיקה שה־Artifact קיים, כולל קבצים נדרשים כמו index.html, ושאפשר לבנות ממנו תוכנית פריסה.",
    fix: "אם validation נכשל, בדקו שהנתיב נכון, שהקבצים קיימים ושהשרת יכול לקרוא את התיקייה.",
    anchor: "deploy"
  },
  deploy: {
    key: "deploy",
    title: "Deploy",
    description: "פריסה של קבצי Release לנתיב dist של אתר SharePoint אחד או יותר. פעולה אמיתית דורשת Dry-run ויכולת כתיבה.",
    fix: "אם Deploy חסום, בדקו Artifact, אתר יעד, גיבוי לפי מצב, Digest ו־SharePoint write.",
    anchor: "deploy"
  },
  "deploy.dryRun": {
    key: "deploy.dryRun",
    title: "Dry-run",
    description: "תוכנית בדיקה לפני ביצוע. היא מחשבת קבצים, גרסאות, חסמים ואזהרות בלי להעלות קבצים.",
    fix: "אל תריצו Execute לפני Dry-run ברור. אם הוא מציג חסמים, תקנו אותם והריצו שוב.",
    anchor: "deploy"
  },
  "deploy.bulk": {
    key: "deploy.bulk",
    title: "Bulk deploy",
    description: "פריסה למספר אתרים או לכל האתרים הפעילים. היא שימושית לעדכון רוחבי אבל דורשת בדיקה קפדנית של חסמים.",
    fix: "אתרים בארכיון לא נכללים כברירת מחדל. בדקו את רשימת היעדים לפני Execute.",
    anchor: "deploy"
  },
  "deploy.perSite": {
    key: "deploy.perSite",
    title: "Per-site deploy",
    description: "פריסה לאתר בודד. מתאים לתיקון נקודתי או בדיקה לפני הפצה רחבה.",
    anchor: "deploy"
  },
  "deploy.mode": {
    key: "deploy.mode",
    title: "Deploy mode",
    description: "מצב בטיחות הפריסה. Local-dev owner mode מקל על עבודה מקומית; production-safe mode שומר על יותר gates ואישורים.",
    fix: "בסביבת production השתמשו במצב production-safe אם נדרשים גיבויים ואישורים.",
    anchor: "deploy"
  },
  "deploy.targetMode": {
    key: "deploy.targetMode",
    title: "Target mode",
    description: "בחירת יעד הפריסה: אתר אחד, אתרים נבחרים או כל האתרים הפעילים.",
    fix: "אם אתר לא מופיע, בדקו שהוא לא בארכיון ושהסינון לא מסתיר אותו.",
    anchor: "deploy"
  },
  "deploy.blocker": {
    key: "deploy.blocker",
    title: "Blocker",
    description: "חסם שמונע פעולה. למשל Artifact חסר, כתיבה חסומה, אתר בארכיון, נתיב לא תקין או גיבוי חסר במצב שמחייב גיבוי.",
    fix: "קראו את סיבת החסם, תקנו את התנאי והריצו שוב Dry-run או בדיקה.",
    anchor: "deploy"
  },
  "deploy.warning": {
    key: "deploy.warning",
    title: "Warning",
    description: "אזהרה לא תמיד חוסמת פעולה, אבל מסמנת סיכון שכדאי להבין לפני המשך.",
    fix: "אם האזהרה קשורה לגיבוי, גרסה או SharePoint, בדקו את הראיות לפני Execute.",
    anchor: "deploy"
  },
  "deploy.evidence": {
    key: "deploy.evidence",
    title: "Evidence",
    description: "ראיות שה־Hub שומר אחרי פעולה: קבצים שנבדקו, HTTP status, size, sha, נתיבי יעד ותוצאת health.",
    fix: "כשפעולה נכשלת, Evidence הוא המקום הראשון להבין מה באמת קרה.",
    anchor: "audit"
  },
  "deploy.versionChange": {
    key: "deploy.versionChange",
    title: "Version before/after",
    description: "הגרסה שהאתר היה עליה לפני פעולה והגרסה שאליה הוא אמור להגיע. זה עוזר לזהות אתרים מיושנים או rollback.",
    anchor: "deploy"
  },
  rollback: {
    key: "rollback",
    title: "Rollback",
    description: "חזרה לגרסה קודמת. זו פעולה מתקדמת שמשנה אתר ולכן צריכה Plan, סיבה ברורה והרצה דרך הדפדפן הפעיל.",
    fix: "אם Rollback חסום, ודאו שיש Plan תקין לכל האתרים הנבחרים ושה־Dry-run מסומן כ־Browser SharePoint.",
    anchor: "deploy"
  },
  "sharepoint.browserConnector": {
    key: "sharepoint.browserConnector",
    title: "Browser SharePoint connector",
    description: "קריאה ל־SharePoint דרך הדפדפן וה־SSO של המשתמש. מתאים לקריאות current user וקריאות read-only מתוך אותה סביבת SharePoint.",
    fix: "אם הדפדפן לא מחובר, פתחו את SharePoint והתחברו מחדש.",
    anchor: "sharepoint"
  },
  "sharepoint.backendConnector": {
    key: "sharepoint.backendConnector",
    title: "Server SharePoint connector",
    description: "מסלול שרת ל־SharePoint מושבת בכוונה. השרת שומר metadata/evidence בלבד ולא קורא או כותב SharePoint.",
    fix: "אין צורך לתקן את השרת. השתמשו ב־Browser SharePoint.",
    anchor: "sharepoint"
  },
  "sharepoint.currentUser": {
    key: "sharepoint.currentUser",
    title: "Current user",
    description: "המשתמש ש־SharePoint מזהה עכשיו בדפדפן או שה־API מזהה בצד השרת.",
    fix: "אם המשתמש לא מזוהה, בדקו currentuser במסך בעיות וחיבורים.",
    anchor: "sharepoint"
  },
  "sharepoint.read": {
    key: "sharepoint.read",
    title: "SharePoint read",
    description: "קריאה מ־SharePoint ללא שינוי קבצים או הרשאות. Health, inventory ו־Live read משתמשים בזה.",
    fix: "אם קריאה נכשלת, בדקו כתובת אתר, הרשאות צפייה ו־CORS/origin.",
    anchor: "sharepoint"
  },
  "sharepoint.digest": {
    key: "sharepoint.digest",
    title: "Digest / contextinfo",
    description: "אישור זמני ש־SharePoint דורש לפני פעולה שמשנה קבצים או הרשאות. אצלנו הוא נבדק בדפדפן המחובר.",
    fix: "אם זה נכשל, פתחו את SharePoint באותו דפדפן ובדקו הרשאות לאתר היעד.",
    anchor: "sharepoint"
  },
  "sharepoint.write": {
    key: "sharepoint.write",
    title: "SharePoint write",
    description: "יכולת לבצע פעולה שמשנה אתר SharePoint: העלאת קבצים, שחזור, הרשאות או תיקון TXT.",
    fix: "כתיבה ל־SharePoint מתבצעת דרך הדפדפן המחובר. השרת שומר סטטוס ו־Evidence בלבד.",
    anchor: "sharepoint"
  },
  "sharepoint.writeBlocked": {
    key: "sharepoint.writeBlocked",
    title: "חסר חיבור ל־SharePoint",
    description: "ה־Hub יכול להציג ולתכנן, אבל פעולה שמשנה SharePoint חייבת לרוץ דרך הדפדפן המחובר.",
    fix: "פתחו את הפעולה דרך Browser SharePoint. אין צורך בהגדרות SharePoint בצד השרת.",
    anchor: "common-problems"
  },
  "sharepoint.401": {
    key: "sharepoint.401",
    title: "401 מ־SharePoint",
    description: "SharePoint דחה בקשה כי היא לא רצה מתוך הדפדפן המחובר של המשתמש.",
    fix: "הריצו את הפעולה דרך Browser SharePoint. השרת שומר רק Evidence.",
    anchor: "common-problems"
  },
  job: {
    key: "job",
    title: "Job",
    description: "משימה שה־Hub מריץ או מתזמן: Health, Deploy, Backup, Restore, Admin sync, Bootstrap או הרשאות.",
    fix: "אם Job נכשל, פתחו פרטים, בדקו Logs ו־Evidence ואז החליטו אם להריץ שוב.",
    anchor: "jobs"
  },
  "job.status": {
    key: "job.status",
    title: "סטטוס Job",
    description: "מצב המשימה: בתור, רץ, מאמת, ממתין לאישור, הצליח, נכשל או בוטל.",
    anchor: "jobs"
  },
  "job.pending": {
    key: "job.pending",
    title: "Pending / Queued",
    description: "המשימה נוצרה ועדיין לא התחילה. לפעמים היא ממתינה לעובד ה־Jobs או לאישור.",
    fix: "אם היא תקועה, בדקו JOB_WORKER_ENABLED ואת סטטוס השרת.",
    anchor: "jobs"
  },
  "job.running": {
    key: "job.running",
    title: "Running",
    description: "המשימה רצה כרגע. אחוז ההתקדמות והלוגים מתעדכנים לאורך הדרך.",
    anchor: "jobs"
  },
  "job.failed": {
    key: "job.failed",
    title: "Failed",
    description: "המשימה הסתיימה בכשל. הכשל עצמו אמור להופיע בשדה שגיאה, בלוגים או ב־Evidence.",
    fix: "בדקו 401, נתיב שגוי, Artifact חסר, חיבור SharePoint או חסם גיבוי.",
    anchor: "jobs"
  },
  "job.completed": {
    key: "job.completed",
    title: "Completed",
    description: "המשימה הסתיימה. הצלחה מלאה תופיע כ־succeeded; ביטול מכוון יופיע כ־cancelled.",
    anchor: "jobs"
  },
  "job.approval": {
    key: "job.approval",
    title: "אישור מתקדם",
    description: "שער החלטה לפני פעולה רגישה. הסוקר רואה סיכונים, נתיבי יעד, גיבוי ו־snapshot לפני אישור או דחייה.",
    anchor: "jobs"
  },
  "job.logs": {
    key: "job.logs",
    title: "Logs",
    description: "רצף הודעות טכניות שנשמרו בזמן הרצת Job. הם עוזרים להבין איפה הפעולה נעצרה.",
    anchor: "jobs"
  },
  backup: {
    key: "backup",
    title: "Backup",
    description: "עותק שמור של קבצים חשובים מאתר Site Builder, בדרך כלל קבצי TXT/JSON ונתוני תצורה רלוונטיים.",
    fix: "אם Backup חסום, בדקו SharePoint write ואת תוכנית המקורות לפני הרצה.",
    anchor: "backups"
  },
  "backup.verified": {
    key: "backup.verified",
    title: "Verified backup",
    description: "גיבוי שנקרא בחזרה ונמצא תואם לפי ראיות כמו size או sha. זה הגיבוי שהכי בטוח להסתמך עליו לפני שינוי.",
    fix: "אם האימות נכשל, בדקו אם הקובץ חסר, השתנה או נחסם בהרשאות.",
    anchor: "backups"
  },
  "backup.restore": {
    key: "backup.restore",
    title: "Restore",
    description: "שחזור קבצים מגיבוי חזרה ליעד SharePoint. זו פעולה שמשנה אתר ודורשת זהירות, סיבה ויכולת כתיבה.",
    fix: "לפני Restore ודאו שהגיבוי הנכון נבחר, שיש Evidence ושנתיב היעד נכון.",
    anchor: "backups"
  },
  "backup.inventory": {
    key: "backup.inventory",
    title: "Inventory",
    description: "קריאה של תיקיות וקבצי גיבוי שכבר קיימים ב־SharePoint, בנפרד מרשומות Mongo.",
    anchor: "backups"
  },
  "backup.schedule": {
    key: "backup.schedule",
    title: "תזמון גיבוי",
    description: "הוראה לשרת ליצור Jobs לגיבוי חוזר לפי מרווח זמן. ההרצה בפועל עדיין תלויה בהרשאות ובמצב SharePoint.",
    anchor: "backups"
  },
  health: {
    key: "health",
    title: "Health check",
    description: "בדיקת תקינות שמוודאת שספריות, dist, index וקבצי TXT קיימים ונגישים.",
    fix: "אם Health נכשל, פתחו Evidence כדי לראות איזה נתיב או קובץ נכשל.",
    anchor: "health"
  },
  "health.readOnly": {
    key: "health.readOnly",
    title: "בדיקה Read-only",
    description: "בדיקה שאינה משנה אתר. היא רק קוראת נתיבים ומחזירה תוצאה.",
    anchor: "health"
  },
  "health.401": {
    key: "health.401",
    title: "AUTH / 401",
    description: "הבדיקה לא הצליחה לקרוא מ־SharePoint בגלל זיהוי חסר או הרשאה לא מספיקה.",
    fix: "בדקו חיבור דפדפן ו־Backend connector במסך בעיות וחיבורים.",
    anchor: "health"
  },
  "health.pathFailure": {
    key: "health.pathFailure",
    title: "כשל נתיב",
    description: "ה־Hub הגיע ל־SharePoint אבל הנתיב שחושב לא נמצא או לא מתאים למבנה Site Builder.",
    fix: "בדקו site code, ספריות siteDB/siteUsersDb ו־final dist path.",
    anchor: "health"
  },
  diagnostics: {
    key: "diagnostics",
    title: "בעיות וחיבורים",
    description: "מסך שמרכז מקור זהות, Origin, API base URL, בדיקות SharePoint, Digest, Write verified ונתיבים מחושבים.",
    fix: "זה המסך הראשון לפתוח כשיש 401, CORS, API לא נכון או SharePoint write חסום.",
    anchor: "sharepoint"
  },
  settings: {
    key: "settings",
    title: "הגדרות",
    description: "מסך מצב סביבה: זהות, API, MongoDB, יכולות SharePoint ומפת פעולות זמינות.",
    anchor: "settings"
  },
  audit: {
    key: "audit",
    title: "Audit log",
    description: "יומן פעולות שמאפשר להבין מי עשה מה, מתי, על איזה entity ומה הייתה התוצאה.",
    fix: "כשפעולה רגישה בוצעה או נכשלה, בדקו Audit יחד עם Job Evidence.",
    anchor: "audit"
  },
  "audit.evidence": {
    key: "audit.evidence",
    title: "Evidence",
    description: "מידע תומך שנשמר לצד פעולה: payload, תוצאה, נתיבי יעד, סטטוסים וראיות אימות.",
    anchor: "audit"
  },
  "monitoring.alert": {
    key: "monitoring.alert",
    title: "התראה",
    description: "בעיה תפעולית שה־Hub זיהה, למשל Job שנכשל, גיבוי מיושן או Health check שנכשל.",
    fix: "פתחו את ההתראה, בדקו פעולה מומלצת ואז סמנו בטיפול רק כשמישהו לקח אחריות.",
    anchor: "jobs"
  },
  "alert.severity": {
    key: "alert.severity",
    title: "Severity",
    description: "רמת חומרה של התראה: קריטי, אזהרה או מידע. היא עוזרת לתעדף טיפול.",
    anchor: "jobs"
  },
  "alert.status": {
    key: "alert.status",
    title: "Status",
    description: "מצב הטיפול בהתראה: פתוח, בטיפול או נסגר.",
    anchor: "jobs"
  },
  operations: {
    key: "operations",
    title: "Operations",
    description: "פעולות תפעול שה־Hub יודע לתכנן או להריץ: בדיקות, גיבויים, פריסות, Bootstrap והרשאות.",
    anchor: "settings"
  },
  "operation.map": {
    key: "operation.map",
    title: "מפת פעולות",
    description: "טבלה שמראה איזו פעולה זמינה, האם היא דורשת כתיבה ומה החסם אם היא חסומה.",
    anchor: "settings"
  },
  "mode.metadataOnly": {
    key: "mode.metadataOnly",
    title: "נתוני מטא בלבד",
    description: "המסך מציג מידע שנשמר ב־Hub. הוא לא בהכרח מוכיח ש־SharePoint נגיש עכשיו.",
    anchor: "sites"
  },
  "mode.readOnly": {
    key: "mode.readOnly",
    title: "קריאה בלבד",
    description: "הפעולה קוראת נתונים או בונה תוכנית ולא משנה קבצים, הרשאות או מבנה אתר.",
    anchor: "sharepoint"
  },
  "mode.owner": {
    key: "mode.owner",
    title: "Owner mode",
    description: "מצב שבו בעל ה־Hub יכול לשלוח Jobs מוגנים ישירות לפי מדיניות הסביבה.",
    anchor: "deploy"
  },
  "mode.productionSafe": {
    key: "mode.productionSafe",
    title: "Production-safe mode",
    description: "מצב זהיר לסביבת production: יותר gates, גיבוי ואישורים לפני פעולה שמשנה אתר.",
    anchor: "deploy"
  },
  "mode.localDevOwner": {
    key: "mode.localDevOwner",
    title: "Local-dev owner mode",
    description: "מצב פיתוח מקומי שמפחית חיכוך לבעלים, אבל עדיין מציג חסמים אמיתיים כמו Artifact חסר או SharePoint write חסום.",
    anchor: "deploy"
  },
  "system.apiBaseUrl": {
    key: "system.apiBaseUrl",
    title: "API base URL",
    description: "כתובת ה־Backend שהדפדפן פונה אליה. אם היא שגויה, המסך יכול להיטען אבל פעולות API ייכשלו.",
    fix: "בדקו את משתני Vite ואת מסך בעיות וחיבורים.",
    anchor: "common-problems"
  },
  "system.cors": {
    key: "system.cors",
    title: "CORS / Origin",
    description: "הגדרת הדומיינים שמורשים לפנות ל־API. SharePoint-hosted Hub צריך origin מתאים.",
    fix: "ודאו ש־CLIENT_ORIGIN או CLIENT_ORIGINS כולל את ה־origin שמופיע בדפדפן.",
    anchor: "common-problems"
  },
  "system.env": {
    key: "system.env",
    title: "Env loaded",
    description: "משתני סביבה שהשרת והלקוח קוראים בזמן build או runtime. שינוי env בצד הלקוח דורש rebuild.",
    fix: "אם toggle לא משפיע, עצרו והריצו build/dev מחדש.",
    anchor: "common-problems"
  },
  "version.current": {
    key: "version.current",
    title: "גרסה נוכחית",
    description: "הגרסה שה־Hub יודע שהאתר נמצא עליה עכשיו. לעיתים זה snapshot ולא קריאה חיה.",
    anchor: "deploy"
  },
  "version.latest": {
    key: "version.latest",
    title: "Latest release",
    description: "הגרסה האחרונה שה־Hub מכיר ב־registry של Releases.",
    anchor: "deploy"
  },
  "version.outdated": {
    key: "version.outdated",
    title: "גרסה מיושנת",
    description: "אתר שנמצא מאחורי Latest release לפי הנתונים שה־Hub מכיר.",
    fix: "הריצו Dry-run לפני החלטה על Deploy. ייתכן שהאתר כבר עודכן מחוץ ל־Hub.",
    anchor: "deploy"
  },
  "version.status": {
    key: "version.status",
    title: "סטטוס גרסה",
    description: "האם האתר עדכני, מיושן, בתהליך עדכון, נכשל או לא נבדק.",
    anchor: "deploy"
  },
  storage: {
    key: "storage",
    title: "נפח רשום",
    description: "גודל שמור במטא־דאטה או נמשך מקריאות קודמות. הוא שימושי למעקב, לא תמיד מדידה חיה.",
    anchor: "sites"
  },
  search: {
    key: "search",
    title: "חיפוש",
    description: "מסנן תצוגה לפי טקסט כמו שם אתר, קוד, בעלים, יחידה או מזהה.",
    anchor: "sites"
  },
  filters: {
    key: "filters",
    title: "סינון",
    description: "צמצום התצוגה לפי סטטוס, תקינות, גרסה, סביבה, תאריך או מדד אחר.",
    anchor: "sites"
  },
  analytics: {
    key: "analytics",
    title: "דשבורד גרפים",
    description: "מסך לניתוח אתרים לפי קבוצות ומדדים. הנתונים מבוססים על רשומות ה־Hub וה־API הזמין כרגע.",
    anchor: "capabilities"
  },
  history: {
    key: "history",
    title: "היסטוריה",
    description: "רשומות עבר של גיבויים, פריסות, Jobs או Audit. שימושי להבנת רצף פעולות.",
    anchor: "audit"
  },
  changelog: {
    key: "changelog",
    title: "Changelog / Notes",
    description: "הערות Release שמסבירות מה השתנה, מה תוקן ומה הסיכונים הידועים.",
    anchor: "deploy"
  }
} satisfies Record<string, HelpContentItem>;

export type HelpContentKey = keyof typeof helpContent;

export function getHelpContent(key?: string): HelpContentItem | undefined {
  if (!key) return undefined;
  return helpContent[key as HelpContentKey];
}

export type HelpPageSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  terms?: readonly string[];
};

export const helpPageSections: readonly HelpPageSection[] = [
  {
    id: "what-is",
    title: "מה זה Site Builder Hub",
    paragraphs: [
      "Site Builder Hub הוא מרכז שליטה וניהול לאתרים רבים שנבנו על בסיס Site Builder.",
      "ה־Hub לא מחליף את אתר SharePoint עצמו. הוא מחזיק שכבת ניהול: registry, סטטוסים, גרסאות, גיבויים, Jobs, הרשאות, ניטור, בדיקות וראיות."
    ]
  },
  {
    id: "capabilities",
    title: "מה אפשר לעשות במערכת",
    bullets: [
      "לעקוב אחרי אתרים קיימים ולנהל רשומות אתר.",
      "לתכנן יצירת אתר חדש ולהריץ Bootstrap/Provision כאשר יש הרשאות.",
      "לבדוק חיבור SharePoint, current user, read test, Digest ו־write verified.",
      "לנהל Releases, Artifact ו־Deploy לאתר אחד או למספר אתרים.",
      "לראות Health, Jobs, Backups, Admins, Audit logs והתראות ניטור.",
      "לאבחן בעיות כמו 401, API backend שגוי, CORS, נתיב SharePoint שגוי או Artifact חסר."
    ]
  },
  {
    id: "sites",
    title: "אתרים",
    paragraphs: [
      "אתר פעיל משתתף בניטור, בדיקות, תכנון גיבויים ופריסות. אתר בארכיון נשמר להיסטוריה ולא נכלל כברירת מחדל בפעולות רוחב.",
      "קוד אתר, סביבה, כתובת SharePoint, final app/dist path ומצב מחבר הם השדות שמאפשרים ל־Hub לחשב נתיבים ולהבין איך לדבר עם האתר."
    ],
    terms: ["site.active", "site.archived", "site.code", "site.environment", "site.sharepointUrl", "site.finalDistPath", "site.connectorMode", "mode.metadataOnly"]
  },
  {
    id: "track-existing",
    title: "הוספת אתר קיים",
    paragraphs: [
      "המסלול הזה שומר אתר שכבר קיים ב־Hub ומפעיל בדיקות קריאה בלבד אם החיבור זמין.",
      "הוא לא יוצר אתר SharePoint, לא יוצר תיקיות, לא מעלה קבצים ולא משנה הרשאות."
    ],
    terms: ["site.addExisting", "sharepoint.read", "health.readOnly"]
  },
  {
    id: "create-new",
    title: "יצירת אתר חדש",
    paragraphs: [
      "מסלול יצירת אתר חדש מתחיל בתכנון: פרטי אתר, בעלים, מנהלים, כתובת SharePoint, ספריות ונתיבי dist.",
      "לאחר מכן ה־Hub יוצר/מאמת את תשתית SharePoint, נתוני TXT או Mongo, runtime config לפי הצורך, ובוחר Release תואם לפריסה ראשונית מתוך אותו מאגר Artifacts.",
      "Releases נשארים מקור ה־Artifact, אבל Create New Site מתזמן את הפריסה הראשונית כחלק מההקמה ולא כצעד שהמשתמש צריך לנחש ידנית."
    ],
    terms: ["site.createNew", "site.bootstrap", "site.owner", "site.admins", "deploy.perSite"]
  },
  {
    id: "create-mongo-site",
    title: "יצירת אתר Mongo חדש",
    paragraphs: [
      "באתר Mongo חדש יש הפרדה חשובה: SharePoint מארח את קבצי האתר, אבל Mongo שומר את הנתונים החיים דרך Builder backend.",
      "siteCode הוא קוד נוח לבניית נתיבים; siteId הוא המזהה שה־Frontend וה־Backend משתמשים בו מול API; safeCollectionName הוא שם ה־collection הפיזי במונגו ובדרך כלל נוצר אוטומטית.",
      "runtime config הוא הקובץ שהאתר קורא בזמן טעינה כדי לדעת שהוא עובד מול Mongo, לא מול TXT, ולאיזה Backend לפנות.",
      "לא מכניסים API key גלוי באשף. מזינים רק credential reference, כדי שסודות לא יופיעו במסך, בלוגים או Audit.",
      "Seed docs הם מסמכי התחלה שמחליפים את קבצי ה־TXT legacy, למשל users_data.txt ו־widgets_data.txt, בתוך Builder backend.",
      "אתר יכול להיות partially-created כאשר חלק מהתשתית קיימת אבל עדיין חסרים runtime config, seed docs, backup capability או dist/index.html מאומת. ready מתקבל רק אחרי שכל החלקים האלה תקינים."
    ],
    terms: [
      "create.siteCode",
      "create.builderSiteId",
      "create.safeCollectionName",
      "create.runtimeConfigPath",
      "create.backendApiUrl",
      "create.credentialRef",
      "create.siteDbLibrary",
      "create.usersDbLibrary",
      "create.initialAdmins"
    ]
  },
  {
    id: "deploy",
    title: "גרסאות ופריסות",
    paragraphs: [
      "Release הוא רשומת גרסה. Artifact הוא תיקיית dist או manifest של הקבצים. Deploy הוא העלאת הקבצים לאתר יעד.",
      "Dry-run בודק לפני ביצוע: גרסאות, יעד, קבצים, חסמים, אזהרות ויכולת כתיבה. Execute אמור להגיע רק אחרי Dry-run ברור.",
      "Bulk deploy מיועד לאתרים רבים; Per-site deploy מתאים לאתר יחיד. Evidence שומר את מה שקרה בפועל."
    ],
    terms: ["release", "artifact", "artifact.validation", "deploy", "deploy.dryRun", "deploy.bulk", "deploy.perSite", "deploy.blocker", "deploy.warning", "deploy.evidence", "deploy.versionChange", "rollback"]
  },
  {
    id: "sharepoint",
    title: "SharePoint חיבורים",
    paragraphs: [
      "יש הבדל חשוב בין הדפדפן לבין השרת המקומי: הדפדפן יכול להיות מחובר ל־SharePoint, אבל השרת המקומי לא מקבל את ההתחברות הזו אוטומטית.",
      "קריאה יכולה לעבוד בדפדפן בזמן ש־Backend write נכשל ב־401. פעולות שמשנות אתר דורשות Digest/contextinfo והרשאות בצד השרת.",
      "Write verified אומר שה־Hub הצליח לאמת יכולת כתיבה. בלי זה, פריסה, Restore והרשאות יישארו חסומות."
    ],
    terms: ["sharepoint.browserConnector", "sharepoint.backendConnector", "sharepoint.currentUser", "sharepoint.read", "sharepoint.digest", "sharepoint.write", "sharepoint.401"]
  },
  {
    id: "admins",
    title: "מנהלים והרשאות",
    paragraphs: [
      "מסך מנהלים משווה בין מקורות הרשאה: users_data.txt, Site Collection Admins ו־Owners Group.",
      "Live SharePoint read נמשך ישירות מ־SharePoint. Mongo snapshot הוא עותק שמור. Admin sync שומר snapshot כדי שאפשר יהיה להשוות לאורך זמן."
    ],
    terms: ["site.adminLiveRead", "site.mongodb", "site.cached", "site.adminSync", "site.txtAdmins", "site.siteCollectionAdmins", "site.ownersGroup"]
  },
  {
    id: "backups",
    title: "גיבויים",
    paragraphs: [
      "Backup שומר עותק של קבצים חשובים, בעיקר קבצי TXT/JSON ותצורה רלוונטית של Site Builder.",
      "Verified backup הוא גיבוי שנקרא בחזרה והראיות שלו תואמות. Restore מחזיר קבצים מגיבוי ולכן הוא פעולה שמשנה אתר.",
      "במצבים מסוימים חסר גיבוי הוא אזהרה; במצבי production-safe הוא יכול להיות חסם."
    ],
    terms: ["backup", "backup.verified", "backup.restore", "backup.inventory", "backup.schedule"]
  },
  {
    id: "jobs",
    title: "Jobs / משימות",
    paragraphs: [
      "Job הוא משימה שה־Hub מריץ או מתזמן. יש Jobs אוטומטיים כמו Health ו־Monitoring, ויש Jobs שנוצרים מפעולת משתמש.",
      "סטטוסים חשובים: Pending/Queued, Running, Failed, Completed ואישור מתקדם. לוגים ו־Evidence עוזרים להבין כשל."
    ],
    terms: ["job", "job.status", "job.pending", "job.running", "job.failed", "job.completed", "job.approval", "job.logs"]
  },
  {
    id: "health",
    title: "בדיקות תקינות",
    paragraphs: [
      "Health check בודק נתיבי SharePoint חיוניים ללא כתיבה: ספריות, dist, index, assets וקבצי TXT.",
      "401 מצביע בדרך כלל על בעיית זהות או הרשאה. כשל נתיב אומר שהחיבור קיים אבל הנתיב המחושב לא נמצא או לא נכון."
    ],
    terms: ["health", "health.readOnly", "health.401", "health.pathFailure"]
  },
  {
    id: "audit",
    title: "יומן פעולות",
    paragraphs: [
      "Audit log מתעד פעולות כדי שיהיה ברור מי עשה מה, מתי, על איזה entity ומה הייתה התוצאה.",
      "Evidence ו־payload טכני עוזרים לבדוק פעולות רגישות או כשלי ביצוע."
    ],
    terms: ["audit", "audit.evidence", "history"]
  },
  {
    id: "common-problems",
    title: "בעיות נפוצות",
    bullets: [
      "401 מ־SharePoint בדפדפן: בדקו שהמשתמש מחובר ושיש הרשאה לאתר היעד.",
      "Server SharePoint מושבת: זה מצב תקין; פעולות SharePoint רצות דרך הדפדפן.",
      "Artifact חסר: חברו dist אמיתי או manifest והריצו Validate.",
      "Digest בדפדפן נכשל: בדקו contextinfo דרך הדפדפן המחובר.",
      "API backend port שגוי: בדקו API base URL במסך בעיות וחיבורים.",
      "CORS/origin: ודאו ש־CLIENT_ORIGIN/CLIENT_ORIGINS כוללים את ה־origin הנוכחי.",
      "אתר בארכיון לא נכלל בפריסה: שחזרו אותו או בחרו יעד פעיל אחר.",
      "Job נכשל: פתחו Logs ו־Evidence לפני Rerun.",
      "env לא נטען: שינוי Vite env דורש rebuild או restart.",
      "Release נוצר בלי Artifact: הוא יופיע, אבל Deploy יהיה חסום.",
      "נתיב אתר שגוי: בדקו site code, SharePoint URL ו־final dist path."
    ],
    terms: ["sharepoint.401", "sharepoint.writeBlocked", "system.apiBaseUrl", "system.cors", "system.env"]
  },
  {
    id: "glossary",
    title: "מילון מונחים",
    terms: [
      "hub.overview",
      "sites.registry",
      "sharepoint.read",
      "release",
      "artifact",
      "deploy",
      "deploy.dryRun",
      "deploy.bulk",
      "site.connectorMode",
      "sharepoint.digest",
      "job",
      "deploy.evidence",
      "audit",
      "site.mongodb",
      "site.cached",
      "mode.metadataOnly",
      "site.environment",
      "site.archived"
    ]
  }
] as const;
