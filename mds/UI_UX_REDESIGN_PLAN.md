# UI/UX Redesign Plan - Site Builder Hub

תאריך: 2026-05-13

## Current UX Problems

- ה-UI מרגיש כמו CRUD demo: הדשבורד כולל גם רשימת אתרים כבדה, ללא הפרדה ברורה בין תמונת מצב לבין ניהול שוטף.
- היררכיית מידע חלשה: KPI, פעולות, סטטוסים, נתיבי SharePoint ויכולות עתידיות מוצגים באותו משקל ויזואלי.
- צבעים וקונטרסט לא עקביים: קיימים אזורים כהים טובים לצד רכיבים בהירים בתוך מצב כהה, גבולות דקים מדי, וטקסטים כחולים/אפורים שקשה לקרוא.
- אין theme system אמיתי: אין light mode, אין persistence, והרכיבים משתמשים ישירות ב-Tailwind colors במקום tokens.
- הניווט לא מכסה את כל אזורי העבודה הנדרשים: אין עמודים ברורים לרשימת אתרים, Audit, Health, Settings.
- פעולות SharePoint אינן מוסברות מספיק: deploy/backup/admin/provision עשויים להיראות אמיתיים גם כאשר הם metadata-only או תלויים ב-write capability.
- טבלאות ו-dropdowns לא מספיק מלוטשים: styling לא אחיד, אין focus state חזק, אין תוויות פעולה מספיק ברורות.
- עמוד פרטי אתר אינו בנוי כעמוד תפעולי: נתיבי SharePoint לא מספיק מלאים, אין tabs, ופעולות/מצב/ראיות מעורבבים.
- יש ערבוב עברית/אנגלית במיקרו-קופי, בעיקר בכותרות ובכפתורים.

## Redesigned Information Architecture

- דשבורד: תמונת מצב ניהולית בלבד - status strip, KPI, דורשים טיפול, פעילות אחרונה, התפלגות תקינות, Jobs אחרונים ואתרים מיושנים.
- רשימת אתרים: עמוד ניהול מרכזי עם חיפוש, פילטרים, מיון, טבלת sites, פעולות מהירות ויצירת אתר.
- פרטי אתר: עמוד תפעולי עם header חזק ו-tabs: סקירה, נתיבי SharePoint, תקינות, גרסאות, גיבויים, מנהלים, Jobs, Audit, הערות.
- גרסאות ופריסות: latest release, התפלגות גרסאות, אתרים מיושנים, יצירת release, תכנון deploy, ו-label ברור כאשר deploy אינו מחובר ל-SharePoint write.
- גיבויים: KPI, backup plan/read-only, backup all/one site עם metadata/write capability badge, היסטוריה.
- מנהלים: הבחנה בין TXT, Site Collection Admins ו-Owners Group, diff קריא, live read, ותיוג Mongo-only/write-gated.
- תורים ו-Jobs: operations console עם פילטרים, progress, errors, logs ו-details drawer.
- יומן פעולות: טבלת audit עם action/entity/result/actor/date/request id/details.
- בדיקות תקינות: מסך רוחבי לבדיקות read-only, סטטוסים וראיות.
- הגדרות: יכולות מערכת וסביבת SharePoint, בלי פעולות כתיבה מזויפות.

## Component Plan

- AppShell, Sidebar, TopBar: layout enterprise RTL, responsive, status strip, theme toggle.
- ThemeToggle: localStorage persistence, `data-theme`, dark/light CSS variables.
- PageHeader, SectionCard, KpiCard: hierarchy consistent, no nested cards.
- StatusBadge, HealthBadge, VersionBadge, MetadataOnlyBadge: shared status language.
- CopyButton, LinkRow: SharePoint path display with copy/open actions and no raw long URLs in dense tables.
- EmptyState, ErrorState, LoadingState: consistent surfaces in both themes.
- DataTable, FilterBar: reusable table shell, sticky-ish header style, horizontal scroll on small screens.
- ConfirmDialog, DetailsDrawer: archive confirmations and job/log details without fake destructive UI.

## Dark/Light Theme Plan

- Use CSS variables for semantic tokens: app background, shell, surface, elevated surface, border, text, muted text, accent, success, warning, danger.
- Implement dark and light themes with accessible contrast and no flashy gradients.
- Set `color-scheme`, `dir=rtl`, stable focus rings, consistent input/select/button styling.
- Persist selected theme in localStorage under `sitebuilder-hub-theme`.
- Use `font-variant-numeric: tabular-nums` and mono font for all numeric/version/date/path values.

## Pages To Change

- `client/src/App.tsx`
- `client/src/styles/index.css`
- `client/src/components/*`
- `client/src/pages/DashboardPage.tsx`
- new `client/src/pages/SitesPage.tsx`
- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/pages/ReleasesPage.tsx`
- `client/src/pages/BackupsPage.tsx`
- `client/src/pages/AdminsPage.tsx`
- `client/src/pages/JobsPage.tsx`
- new `client/src/pages/AuditPage.tsx`
- new `client/src/pages/HealthPage.tsx`
- new `client/src/pages/SettingsPage.tsx`

## Acceptance Checklist

- [ ] Hebrew RTL is consistent across navigation, pages, forms, tables and modals.
- [ ] Dark mode and light mode are both readable, calm and professional.
- [ ] Dashboard answers site count, attention, outdated versions, failed health/jobs, recent updates and SharePoint verification state.
- [ ] Site list has search/filter/sort, clear badges and non-noisy actions.
- [ ] Site details clearly exposes final URL, site root, siteDB, siteUsersDb, siteAssets, dist, master config, users, widgets, backups and bootstrap URL.
- [ ] Every metadata-only/read-only/not-connected operation is visibly labeled.
- [ ] Dropdowns, inputs, buttons, tables, badges and modals use shared styling.
- [ ] Build passes with existing API clients and routes unchanged.
