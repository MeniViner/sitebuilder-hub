# Site Builder Hub Help System Report

## Scope

Added a Hebrew help/explanation layer across the Hub:

- Central help content and glossary in `client/src/help/helpContent.ts`.
- Runtime help icon toggle in `client/src/help/helpConfig.ts`.
- Reusable `HelpIcon` and `HelpLabel` components.
- Contextual help on major pages, KPI cards, panels, statuses, table headers, and important labels.
- New `/help` route titled `מרכז הסברים`.
- Sidebar navigation item for `מרכז הסברים`.
- Documentation for `VITE_HUB_HELP_ICONS_ENABLED`.

## Required Help Center Sections

The help center includes:

- מה זה Site Builder Hub
- מה אפשר לעשות במערכת
- אתרים
- הוספת אתר קיים
- יצירת אתר חדש
- גרסאות ופריסות
- SharePoint חיבורים
- מנהלים והרשאות
- גיבויים
- Jobs / משימות
- בדיקות תקינות
- יומן פעולות
- בעיות נפוצות
- מילון מונחים

## Hebrew Copy Cleanup

- Replaced the old SharePoint 401 UI explanation with:
  `הדפדפן מחובר ל־SharePoint, אבל השרת המקומי לא מחובר`
- Static UI tests guard against returning `ארכב`, `פעולה כותבת מסוכנת`, and the old English 401 explanation in client UI.

## Environment Toggle

Inline help icons are enabled by default.

```bash
VITE_HUB_HELP_ICONS_ENABLED=true
```

Set this to `false` to hide inline help icons while keeping the `/help` page available.

## Verification

Passed:

- `npm test`
  - 21 test files passed
  - 107 tests passed
- `npm run build`
  - server TypeScript build passed
  - client TypeScript build passed
  - Vite production build passed

Browser smoke via in-app browser on `http://localhost:5177`:

- `#/help`
  - help center rendered
  - all 14 required sections found
  - 24 inline help icons found
- `#/sites`
  - sites page rendered
  - archive copy visible
  - 35 inline help icons found
  - no visible page error
- `#/releases`
  - release/deploy center rendered
  - deploy copy visible
  - 39 inline help icons found
  - no visible page error
- `#/sites/6a2a5733af64d40d8f20fe4d`
  - site detail page rendered
  - overview, SharePoint paths, and admins content visible
  - 23 inline help icons found
  - no visible page error
- `#/diagnostics`
  - diagnostics page rendered
  - Hebrew 401 explanation/check visible
  - 22 inline help icons found
  - no visible page error
- Tooltip click/focus behavior
  - clicked a unique help icon
  - tooltip opened
  - computed tooltip direction was `rtl`
- Browser console errors: none

## Note

During implementation, `client/src/pages/AdminsPage.tsx` was repaired from the repository baseline after a malformed shell redirect corrupted the working file. The page now builds and includes contextual help on the header, main sections, KPI cards, labels, and table headers.

## Remaining Gaps

- No known blocking gaps for the requested help layer.
- Future refinements can add even more micro-copy to rare nested drawer fields, but all major pages, routes, and core technical concepts now have centralized Hebrew help coverage.
