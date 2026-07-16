# Future gateway and site-data API contract (documentation only)

This is preparation for a later phase. S0/S1 does not mount a route, proxy traffic, replace authentication or absorb Builder code into HUB.

## Trust boundary

The future HUB gateway authenticates the user, authorizes the exact `siteId`, then issues a short-lived, site-scoped token or maintains a secure server session. Browsers must not receive a global Builder key. Server-to-server compatibility credentials may exist only in server secret storage and must be independently revocable.

Required token claims are `sub`, exact `siteId`, `aud=site-data`, `scopes`, `iat`, `exp`, `jti`, and `requestId`. Tokens must be short-lived and rejected for a different site, audience or operation. Cookie sessions require Secure/HttpOnly/SameSite attributes and CSRF protection. CORS is exact-origin, not wildcard. `requestId` and an idempotent `operationId` propagate through gateway, Builder, revisions and audit metadata without exposing user contact records.

## Future API surface

The versioned compatibility target is `/api/site-data/v1`, covering registry reads/explicit provisioning, data CRUD, legacy-object compatibility, backups and health. Existing optimistic version semantics remain: callers supply the expected non-negative version; create begins at version 1; conflicts preserve current response/error parity. Hashes, `_id` format, soft deletion, backup packages, revisions/audit behavior and physical naming remain Builder contracts.

An old frontend that appends `/api/sites/...` can temporarily receive a compatibility base ending before that segment (for example a dedicated gateway origin or `/builder-compat` base). It must not be pointed at HUB's existing `/api/sites`, because that path is the HUB control-plane route. The compatibility mapping must be explicit and covered by contract tests before mounting.

## Required future contract tests

- exact site authorization and cross-site denial;
- token expiry/audience/scope/JTI behavior;
- exact-origin CORS and CSRF behavior;
- legacy request/response/error parity;
- optimistic conflicts, soft deletion, hashes, revision/audit and backup parity;
- request/operation ID propagation;
- compatibility-base routing without collision with HUB `/api/sites`;
- rollback to the original Builder endpoint without data loss.
