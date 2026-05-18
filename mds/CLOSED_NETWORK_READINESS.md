# Closed-Network Readiness

Use `sitebuilder-hub/scripts/Test-ClosedNetworkBundle.ps1` on a connected build machine before moving the project into a closed network.

The script has two modes:

- Safe check mode, the default: reads the workspace and reports readiness without writing bundle files.
- Archive mode: add `-CreateArchive` to create a fresh timestamped zip and manifest under `sitebuilder-hub/artifacts/closed-network`.

## Safe Check

From the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\sitebuilder-hub\scripts\Test-ClosedNetworkBundle.ps1
```

PowerShell 7 also works:

```powershell
pwsh -NoProfile -File .\sitebuilder-hub\scripts\Test-ClosedNetworkBundle.ps1
```

## Create A Portable Bundle

After a clean install and build on the connected machine, run:

```powershell
npm ci
npm run build
npm --prefix newAlphaAIBackend\newAlphaAIBackend ci
npm --prefix sitebuilder-hub ci
npm --prefix sitebuilder-hub\server ci
npm --prefix sitebuilder-hub\client ci
npm --prefix sitebuilder-hub run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\sitebuilder-hub\scripts\Test-ClosedNetworkBundle.ps1 -CreateArchive
```

The generated archive includes source, lockfiles, `dist` outputs, `node_modules`, env examples, docs, and scripts.

The generated archive excludes `.git` folders, `.env` secret files, existing archive files, logs, temp files, and `sitebuilder-hub/artifacts`.

Archive mode defaults to `-ArchiveCompressionLevel NoCompression` so bundling dependency folders is much faster. Use `-ArchiveCompressionLevel Fastest` or `-ArchiveCompressionLevel Optimal` only when smaller archive size is more important than runtime.

## What The Script Checks

- Lockfiles for each detected package root:
  - project root
  - `sitebuilder-hub`
  - `sitebuilder-hub/client`
  - `sitebuilder-hub/server`
  - `newAlphaAIBackend/newAlphaAIBackend`
- `node_modules` exists for each detected package root.
- Build outputs exist:
  - `dist`
  - `sitebuilder-hub/client/dist`
  - `sitebuilder-hub/server/dist`
- Env examples exist:
  - `.env.example`
  - `sitebuilder-hub/.env.example`
  - `sitebuilder-hub/client/.env.example`
  - `sitebuilder-hub/server/.env.example`
  - `newAlphaAIBackend/newAlphaAIBackend/.env.example`
- Local runtime versions:
  - Node.js 20+
  - npm 10+
  - MongoDB 7+ via `mongod` or `mongosh` on PATH
- Secret env files that will be excluded from the generated archive.

## MongoDB Handoff

MongoDB does not have to be embedded in the project archive, but the closed-network handoff must include one of these:

- an approved MongoDB 7+ installer or portable runtime;
- a preloaded Docker image, for example `mongo:7`, plus Docker installation instructions;
- an internal MongoDB service URI and access procedure.

If neither `mongod` nor `mongosh` is available on the connected build machine, the script reports a warning so this requirement is not missed during transfer.

## Closed-Network Restore Checklist

1. Install or verify Node.js 20+ and npm 10+.
2. Install or connect to MongoDB 7+.
3. Unpack the generated archive.
4. Create real `.env` files from the included `.env.example` files.
5. Run the safe check again inside the closed network.
6. Start services with the documented project commands.
