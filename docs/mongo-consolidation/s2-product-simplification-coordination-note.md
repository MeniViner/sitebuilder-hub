# Product-simplification coordination note

- Preserve existing technical identity/status fields in API data even when the simplified UI does not display them: HUB `_id`, `siteIdentityKey`, legacy `builderSiteId`/`mongoSiteId`, `safeCollectionName`, storage/lifecycle/provisioning/runtime health fields and any future optional `siteDataBinding`.
- Do not collapse duplicate HUB rows visually into one installation. Archived/superseded/duplicate candidates must remain distinguishable until a human disposition exists.
- Map unknown, partial, mismatch, blocked, archived and superseded production states conservatively; never present unknown evidence as healthy or migrated.
- No frontend, navigation, Dashboard, Sites, Site Details, Operations, Settings, CSS or label implementation is part of this package.
