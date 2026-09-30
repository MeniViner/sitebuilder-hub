# Product-simplification coordination note

This continuation changes no frontend code. The simplified product surface must preserve the technical fields and states needed for a later reviewed mapping: HUB `_id`, `siteIdentityKey`, legacy `builderSiteId`/`mongoSiteId`, `safeCollectionName`, storage/lifecycle/provisioning/runtime-health fields, and any future optional `siteDataBinding`.

Do not visually collapse duplicate `siteCode` rows or portray unknown, partial, mismatch, blocked, archived, or superseded records as a healthy single installation. `siteCode`, name, owner, and SharePoint URL remain supporting context—not identity keys.

No UI, navigation, CSS, browser API client, gateway, or route was changed by this workstream.
