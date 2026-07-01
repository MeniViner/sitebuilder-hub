# דוח: מיגרציית אתר TXT קיים ל־Mongo

## מה הכלי עושה

הכלי נועד לקחת אתר Site Builder קיים שעובד בשיטת TXT, לשמור את כל הנתונים החיים שלו, ולהעביר אותו לשיטת Mongo.

הפעולה מתחילה מתוך מסך פרטי האתר בכפתור:

`המר אתר TXT ל־Mongo ועדכן dist`

## העיקרון החשוב

אין SharePoint בשרת.

כל קריאה או כתיבה ל־SharePoint נעשית דרך הדפדפן המחובר של המשתמש. השרת לא קורא קבצי TXT מ־SharePoint, לא מעלה קבצים ל־SharePoint, ולא מבקש Digest מול SharePoint.

## רצף הפעולה

1. הדפדפן קורא מהאתר הקיים את כל קבצי ה־TXT המחייבים:
   - `bihs_master_config_v1.txt`
   - `users_data.txt`
   - `events_data.txt`
   - `nav_data.txt`
   - `site_content_data.txt`
   - `theme_data.txt`
   - `widgets_data.txt`
   - `external_links_data.txt`
   - `gantt_data.txt`

2. הדפדפן שולח לשרת Snapshot של התוכן שכבר נקרא.

3. השרת כותב את הנתונים ל־Builder/Mongo backend:
   - יוצר או מאמת Site registry.
   - קורא גרסאות קיימות ב־Mongo.
   - כותב את כל מסמכי ה־legacy בפורמט Mongo.
   - שומר Evidence וסיכום במטא־דאטה של האתר.

4. הדפדפן מעלה ל־SharePoint את `sitebuilder-runtime-config.json`.

5. הדפדפן בוחר את ה־Release האחרון שמוכן לפריסה ותואם Mongo.

6. הדפדפן מעלה את קבצי ה־dist של אותו Release ל־SharePoint.

7. הדפדפן מעלה גם `sitebuilder-deployment.json`, כדי שהאתר החי ידע:
   - איזו גרסה נפרסה.
   - לאיזה SharePoint root הוא מורשה.
   - שהפריסה נעשתה דרך Hub.

8. השרת מקבל רק Evidence של מה שכבר בוצע בדפדפן ומעדכן סטטוס/גרסה.

## מה נשמר ב־Mongo

קבצי ה־TXT הופכים למסמכי legacy תחת אתר ה־Builder/Mongo המתאים. זה כולל משתמשים, ניווט, תוכן, theme, widgets, external links, events ו־gantt.

הכתיבה משתמשת בגרסת המסמך הקיימת ב־Mongo אם יש אחת, ולכן המיגרציה יכולה לדרוס נתונים קיימים בצורה מבוקרת ולא דרך `expectedVersion: 0` עיוור.

## מה נשאר ב־SharePoint

SharePoint ממשיך לארח את קבצי האתר:

- `dist`
- assets
- runtime config
- metadata של deploy
- קבצי TXT היסטוריים, אם עדיין קיימים

הנתונים החיים אחרי המיגרציה אמורים להיקרא מ־Mongo דרך runtime config וגרסת dist תואמת Mongo.

## מצבי כשל

אם קריאת TXT בדפדפן נכשלת, המיגרציה נעצרת לפני כתיבה ל־Mongo.

אם כתיבה ל־Mongo נכשלת, השרת שומר Evidence וכשל.

אם runtime config או deploy ל־SharePoint נכשל אחרי הייבוא, הנתונים כבר קיימים ב־Mongo אבל האתר החי עלול עדיין להריץ dist ישן. במקרה כזה צריך לפתוח את Evidence/Versions ולסיים פריסת Release Mongo דרך הדפדפן.

אם אין Release תואם Mongo ומוכן לפריסה, הכלי לא מנחש ולא מעלה dist לא מתאים.

## בדיקות שכוסו

- בדיקת שרת שמייבאת Snapshot TXT מלא ל־Mongo.
- בדיקת שרת שחוסמת Snapshot חסר.
- בדיקה סטטית שה־UI, ה־API וה־route של המיגרציה קיימים.
- build client/server עברו אחרי החיבור.

## שורה תחתונה

הכלי מחבר את המעבר המלא:

TXT חי ב־SharePoint -> Snapshot בדפדפן -> Mongo בשרת Builder -> runtime config בדפדפן -> dist Mongo בדפדפן -> Evidence בשרת.

אין בשלב הזה שום ניסיון של השרת להתחבר ל־SharePoint.
