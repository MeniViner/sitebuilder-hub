# Site Builder Hub legacy-view toggle

## Scope and baseline

The modern Site Builder-style interface remains the default. Legacy mode restores the exact user-visible Hub experience from commit `53488763b0a460613a639f5b0d7b2301a821ccd1`, the direct parent of the Site Builder design transfer.

The historical Advanced, Diagnostics, Help, and Labs pages are not promoted into primary navigation. They retain their existing role and feature gates in both modes.

## Switching behavior

- Desktop: compact utility action in the top bar.
- Mobile: full-width action inside the focus-contained navigation sheet.
- Modern label: `תצוגה ישנה`.
- Legacy label: `חזרה לתצוגה החדשה`.
- Browser preference key: `sitebuilder-hub-ui-mode`.
- Valid stored values: `modern` and `legacy`.
- QA/deep-link override: `?ui=modern` or `?ui=legacy`.

An explicit URL value wins while it is present and is never written into local storage automatically. Activating the visible switch is an explicit user preference: it stores the selected mode and removes the `ui` override from the current URL so the requested change can take effect.

The app supports `ui` in the document query (for example `/?ui=legacy#/sites`) and in the HashRouter query (for example `/#/sites?ui=legacy`). A HashRouter query wins if both forms are present.

## Route preservation

Both shells render the same route tree and page/data components. Switching therefore uses an identity mapping:

| Logical destination | Modern route | Legacy route |
| --- | --- | --- |
| Dashboard | `/` | `/` |
| Sites | `/sites` | `/sites` |
| Create Site | `/sites/new` | `/sites/new` |
| Site workspace | `/sites/:id` | Same path, managed Site ID, and query |
| Operations | `/operations` | `/operations` |
| Settings | `/settings` | `/settings` |

No fallback is currently required because every normal modern destination has a legacy equivalent. Existing workspace queries such as `area=backups` remain unchanged.

## Implementation boundary

- `LegacyAppShell`, `LegacySidebar`, `LegacyTopBar`, and `LegacyThemeToggle` preserve the pre-redesign shell composition.
- `legacy.css` is a scoped, generated snapshot of the exact pre-redesign stylesheet and includes its original Assistant typography and light/dark tokens.
- `ProductPage` emits the original pre-redesign header structure in legacy mode and the Site Builder-style header in modern mode.
- Current routes, pages, domain facade, API client, Mongo boundaries, identity behavior, and Admin/Viewer checks are shared. No data fetch is duplicated.
- Current dialog portals, focus containment, inert background handling, and reduced-motion protections remain in use.

The generator recorded in `client/scripts/generate-legacy-css.mjs` requires the referenced Git commit to be available. The generated `client/src/styles/legacy.css` is already committed and is what closed-environment builds consume.
