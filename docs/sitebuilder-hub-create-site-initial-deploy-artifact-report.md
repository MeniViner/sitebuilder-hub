# Create Site Initial Deploy Artifact Report

## What Was Missing

Create New Site prepared the SharePoint target folders, but it did not own the source build/artifact decision. A new site could end up partially provisioned while the user still had to leave the flow, open Releases, choose an artifact manually, and hope it matched the selected storage backend.

## Release / Artifact Compatibility Model

Release artifact validation now records compatibility metadata on `artifactValidation`:

- `storageCompatibility: Array<"txt" | "mongo">`
- `artifactKind: "site-builder-frontend" | "legacy-txt-frontend" | "mongo-frontend" | "unknown"`
- `requiresRuntimeConfig`
- `preservesRuntimeConfig`
- `requiredFolders`
- `runtimeConfigFiles`
- `compatibilitySource`
- `compatibilityWarnings`

`sharepoint-deploy-manifest.json` can now be either the legacy array of file paths or an object with `files` plus compatibility metadata. If compatibility is not declared, the validator infers only from recognizable TXT/Mongo signals. If no signal exists, compatibility remains `unknown`, and Create New Site will not auto-select the Release.

## Wizard Changes

The `פריסה ראשונית` step now supports:

- auto-select latest compatible deployable Release
- manually choose from compatible Releases
- advanced explicit selection of unknown-compatibility Releases
- intentional skip

Mongo sites default to Mongo-compatible artifacts. TXT legacy sites default to TXT-compatible artifacts. Incompatible artifacts are not shown as normal options.

If skipped, the UI says:

`האתר נוצר חלקית. עדיין לא בוצעה פריסה ראשונית.`

## Plan Changes

The Create plan now shows initial deploy details:

- selected Release
- artifact validity
- Mongo compatibility
- TXT compatibility
- runtime config preservation
- required folders
- the fact that deploy is blocked until SharePoint foundations are ready

## Artifact Folder Derivation

The new folder derivation utility walks artifact file paths, normalizes separators, blocks traversal, dedupes folder prefixes, and preserves nested structure.

Example:

```text
assets/index-abc.js
assets/chunks/app.js
images/logo.png
fonts/font.woff2
```

Creates/verifies:

```text
dist/assets
dist/assets/chunks
dist/images
dist/fonts
```

## Runtime Config Preservation

Mongo deploy still uses the existing release deploy plan filtering that skips runtime config files:

- `sitebuilder-runtime-config.json`
- `runtime-config.json`

The Create flow verifies runtime config after initial deploy and checks:

- `storageBackend: "mongo"`
- expected `backendApiUrl`
- expected `siteId`
- API key exists without exposing it

## Execution Flow

Create New Site now orchestrates initial deploy after provisioning:

1. Create/verify SharePoint libraries and folders.
2. For Mongo, create registry, seed docs, and upload runtime config.
3. Validate selected Release artifact compatibility.
4. Derive and create artifact-specific folders.
5. Reuse `deployArtifactToSharePointBrowser`.
6. Record standard browser deploy evidence through the existing backend evidence endpoint.
7. Verify `index.html`.
8. Probe and record final app URL evidence.
9. For Mongo, verify runtime config again.
10. Update readiness based on verified evidence.

No second upload implementation was added.

## Readiness Changes

Successful browser deploy evidence now updates dist/index health and stores final app URL evidence when available. New create-flow sites become ready only when the required foundations, data/backend health, runtime config, and verified initial deploy are present. Skipped or failed initial deploy leaves the site `partially-created`.

The Create flow records only one deployment evidence row per attempted initial deploy, even when a later readiness gate such as runtime config or final URL verification fails.

## Tests And Build

- `npm test`: passed, 49 files / 219 tests.
- `npm run build`: passed.
- Build warning: Vite reported the existing large client chunk warning.

## Remaining Blockers

- Existing Releases UI still supports normal deploy workflows, and compatibility is not used to globally block all release deploys. Create New Site is the stricter path.
- Unknown compatibility can be selected only as an explicit advanced override; this should be used sparingly until artifacts declare compatibility in their manifest.
