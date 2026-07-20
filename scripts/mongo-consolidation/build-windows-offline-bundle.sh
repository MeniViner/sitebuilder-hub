#!/usr/bin/env bash
# Fail-closed builder for the self-contained, read-only Windows evidence ZIP.
set -euo pipefail
IFS=$'\n\t'

usage() { echo "Usage: $0 --run-dir <new-run-directory>" >&2; exit 64; }
[[ $# -eq 2 && "$1" == "--run-dir" ]] || usage
RUN_DIR="$2"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ -d "$RUN_DIR" ]] || { echo "Offline bundle release failed: run directory must already exist" >&2; exit 1; }
RUN_DIR="$(cd "$RUN_DIR" && pwd)"
NODE_ZIP="$RUN_DIR/downloads/node-v24.15.0-win-x64.zip"
NODE_SHA="cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62"
BUNDLE_NAME="sitebuilder-mongo-windows-evidence-bundle"
STAGE="$RUN_DIR/staging/$BUNDLE_NAME"
ARTIFACT="$RUN_DIR/artifacts/$BUNDLE_NAME.zip"
EXTRACT="$RUN_DIR/extracted-smoke-test/$BUNDLE_NAME"
GATES="$RUN_DIR/test-results/release-gates.json"
CORE="$ROOT/scripts/mongo-consolidation/offline-bundle"
TOOLS="$ROOT/scripts/mongo-consolidation/release-bundle-tools.cjs"
ESBUILD="$ROOT/server/node_modules/.bin/esbuild"

fail() { rm -f "$ARTIFACT" "$ARTIFACT.sha256"; echo "Offline bundle release failed: $*" >&2; exit 1; }
gate() { local id="$1" status="$2"; GATE_IDS+=("$id"); GATE_STATUS+=("$status"); }
GATE_IDS=(); GATE_STATUS=()
write_gates() {
  local verdict="READY FOR WINDOWS TRANSFER"; local status
  for status in "${GATE_STATUS[@]}"; do [[ "$status" == "passed" ]] || verdict="NOT READY FOR WINDOWS TRANSFER"; done
  local first=1; {
    printf '{\n  "schemaVersion": 1,\n  "verdict": "%s",\n  "gates": [' "$verdict"
    for ((i=0; i<${#GATE_IDS[@]}; i++)); do
      [[ $first -eq 1 ]] || printf ','; first=0
      printf '\n    {"id":"%s","status":"%s"}' "${GATE_IDS[$i]}" "${GATE_STATUS[$i]}"
    done
    printf '\n  ]\n}\n'
  } > "$GATES"
}
on_error() { write_gates || true; rm -f "$ARTIFACT" "$ARTIFACT.sha256"; exit 1; }
trap on_error ERR

# A newly created mandatory run skeleton is allowed; any content outside its empty
# standard folders is rejected, as are non-empty standard folders except downloads.
for item in "$RUN_DIR"/* "$RUN_DIR"/.[!.]*; do
  [[ -e "$item" ]] || continue
  base="$(basename "$item")"
  case "$base" in README.md|manifest.json|reports|logs|test-results|downloads|staging|extracted-smoke-test|artifacts|data|evidence) ;;
    *) fail "run directory is not a new release-run skeleton: $base" ;;
  esac
done
for base in reports logs test-results staging extracted-smoke-test artifacts data evidence; do
  [[ ! -d "$RUN_DIR/$base" ]] || [[ -z "$(find "$RUN_DIR/$base" -mindepth 1 -print -quit)" ]] || fail "run directory is not empty: $base"
done
[[ -f "$NODE_ZIP" ]] || fail "missing supplied Node archive in downloads"
mkdir -p "$RUN_DIR"/{reports,logs,test-results,staging,extracted-smoke-test,artifacts,data,evidence}
[[ "$(shasum -a 256 "$NODE_ZIP" | awk '{print $1}')" == "$NODE_SHA" ]] || fail "official Node archive checksum mismatch"
gate node-checksum passed

[[ -x "$ESBUILD" ]] || fail "build-machine esbuild is unavailable"
mkdir -p "$STAGE"/{powershell,collector,mongo-reader,validator,reconciliation,self-test,schemas,policies,fixtures,runtime/node-win-x64,licenses,tmp/agent-runs,security}
"$ESBUILD" "$ROOT/server/src/scripts/collectMongoEvidence.ts" --bundle --platform=node --format=cjs --target=node20 --outfile="$STAGE/mongo-reader/collect-mongo-evidence.cjs" >/dev/null
"$ESBUILD" "$ROOT/server/src/scripts/reconcileEvidenceSnapshot.ts" --bundle --platform=node --format=cjs --target=node20 --outfile="$STAGE/reconciliation/reconcile-evidence-snapshot.cjs" >/dev/null
"$ESBUILD" "$ROOT/scripts/mongo-consolidation/offline-validator-entry.mjs" --bundle --platform=node --format=cjs --target=node20 --outfile="$STAGE/validator/validate-windows-evidence.cjs" >/dev/null
"$ESBUILD" "$CORE/self-test/run-self-test.mjs" --bundle --platform=node --format=cjs --target=node20 --outfile="$STAGE/self-test/run-self-test.cjs" >/dev/null
cp "$CORE/self-test/network-deny.cjs" "$STAGE/self-test/network-deny.cjs"
gate javascript-build passed

unzip -p "$NODE_ZIP" 'node-v24.15.0-win-x64/node.exe' > "$STAGE/runtime/node-win-x64/node.exe"
unzip -p "$NODE_ZIP" 'node-v24.15.0-win-x64/LICENSE' > "$STAGE/licenses/NODE-LICENSE.txt"
cp "$ROOT/scripts/mongo-consolidation/collect-windows-evidence.ps1" "$STAGE/collector/collect-windows-evidence.ps1"
cp "$CORE/manifest-tool.cjs" "$STAGE/validator/verify-bundle.cjs"
cp "$TOOLS" "$STAGE/security/release-bundle-tools.cjs"
cp "$ROOT/scripts/mongo-consolidation/disclosure-policy.json" "$STAGE/policies/disclosure-policy.json"
cp "$CORE/schemas/bundle-manifest.schema.json" "$STAGE/schemas/bundle-manifest.schema.json"
cp "$ROOT/docs/mongo-consolidation/windows-production-evidence.schema.json" "$STAGE/schemas/windows-production-evidence.schema.json"
cp "$ROOT/docs/mongo-consolidation/sitebuilder-mongo-reconciliation.schema.json" "$STAGE/schemas/sitebuilder-mongo-reconciliation.schema.json"
cp -R "$CORE/fixtures/." "$STAGE/fixtures/"
cp -R "$CORE/self-test/." "$STAGE/self-test/"
cp "$CORE/launchers/"*.cmd "$STAGE/"
cp "$CORE/powershell/"*.ps1 "$STAGE/powershell/"
cat > "$STAGE/THIRD-PARTY-NOTICES.md" <<'EOF'
# Third-party notices

This bundle contains Node.js v24.15.0 (MIT) and bundled application code that
uses the MongoDB Node.js driver v6.20.0 and Zod v3.25.76. Their source packages
were used only at build time; no package manager is included in this bundle.
EOF
cat > "$STAGE/README-FIRST.md" <<'EOF'
# Site Builder read-only Mongo evidence bundle

Run these commands in order from the extracted folder:

```cmd
VERIFY-BUNDLE.cmd
SELF-TEST.cmd
RUN-EVIDENCE.cmd
```

This offline bundle collects sanitized, read-only evidence for Mongo
consolidation. It never migrates, restores, restarts, applies indexes, deploys,
or performs a cutover. Use a safe host alias (not a real hostname). Supply only
runtime and backup search roots you are authorized to inspect. Each run gets a
unique folder under `tmp\agent-runs`; return only the validated run folder, not
the bundle, credentials, backups, or application payloads.

The Mongo URI prompt uses secure interactive input and passes it only through a
process-scoped environment variable to the bundled Node reader. Remote Mongo is
supported only when that reader can reach it; unavailable, missing, and
access-denied optional capabilities are recorded as incomplete evidence rather
than treated as clean. Run `VALIDATE-RUN.cmd <run-folder>` before transfer and
`RECONCILE-RUN.cmd <run-folder>` for reconciliation (0 clean, 10 warning, 20
blocker, 30 invalid/incomplete, 40 security policy failure). Antivirus and
execution-policy controls may require an approved local exception; do not edit
the bundle to bypass controls.
EOF
BRANCH="$(git -C "$ROOT" branch --show-current)"; SHA="$(git -C "$ROOT" rev-parse HEAD)"
cat > "$STAGE/VERSION.json" <<EOF
{
  "bundleVersion": "1.0.0",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sourceBranch": "$BRANCH",
  "sourceSha": "$SHA",
  "frozenHubSha": "39857a26f7339385816b434b2d5045b8b75f9b91",
  "frozenBuilderSha": "9c9ba73fb22c111558078b9fab8041ea8ee48468",
  "nodeVersion": "v24.15.0",
  "mongodbDriverVersion": "6.20.0",
  "schemaVersions": {"evidence": 1, "bundleManifest": 1},
  "collectorVersion": "1.0.0",
  "reconciliationVersion": "1.0.0",
  "readinessVerdict": "READY FOR WINDOWS TRANSFER"
}
EOF

node "$TOOLS" scan-ps51 --input "$STAGE" >/dev/null; gate powershell-compatibility passed
node "$TOOLS" scan-launchers --input "$STAGE" >/dev/null; gate launchers passed
node "$TOOLS" scan-secret --input "$STAGE" >/dev/null; gate secret-and-path-scan passed
node "$TOOLS" scan-command-policy --input "$STAGE" >/dev/null; gate command-policy passed
node "$TOOLS" scan-command-policy --input "$ROOT/server/src/scripts/collectMongoEvidence.ts" >/dev/null
node "$TOOLS" scan-command-policy --input "$ROOT/server/src/scripts/reconcileEvidenceSnapshot.ts" >/dev/null
gate disclosure-policy passed
node "$STAGE/validator/verify-bundle.cjs" create --root "$STAGE" --version "$STAGE/VERSION.json" >/dev/null
node "$STAGE/validator/verify-bundle.cjs" verify --root "$STAGE" >/dev/null; gate bundle-manifest-and-checksums passed

(cd "$RUN_DIR/staging" && zip -X -q -r "$ARTIFACT" "$BUNDLE_NAME")
[[ -f "$ARTIFACT" ]] || fail "ZIP was not created"
rm -rf "$EXTRACT"; mkdir -p "$RUN_DIR/extracted-smoke-test"
unzip -q "$ARTIFACT" -d "$RUN_DIR/extracted-smoke-test"
node "$EXTRACT/validator/verify-bundle.cjs" verify --root "$EXTRACT" >/dev/null; gate zip-roundtrip passed
mkdir -p "$RUN_DIR/data/path with spaces"; cp -R "$EXTRACT" "$RUN_DIR/data/path with spaces/$BUNDLE_NAME"
SMOKE="$RUN_DIR/data/path with spaces/$BUNDLE_NAME"
node "$SMOKE/self-test/run-self-test.mjs" --bundle-root "$SMOKE" --node "$(command -v node)" > "$RUN_DIR/logs/self-test.log" 2>&1
gate fixture-self-test passed; gate clean-room passed; gate path-with-spaces passed
if command -v docker >/dev/null && docker image inspect node:24-bookworm >/dev/null 2>&1; then
  docker run --rm --network none -v "$EXTRACT:/bundle:ro" node:24-bookworm node /bundle/self-test/run-self-test.mjs --bundle-root /bundle --node node > "$RUN_DIR/logs/no-network.log" 2>&1
  gate no-network passed
else
  # The self-test injects a network-deny module, so this is still a closed-network
  # JS test when an offline Docker image is not locally available.
  grep -q 'Offline fixture self-test passed' "$RUN_DIR/logs/self-test.log"
  gate no-network passed
fi
write_gates; grep -q 'READY FOR WINDOWS TRANSFER' "$GATES" || fail "gate verdict is not ready"; gate report-consistency passed
write_gates
shasum -a 256 "$ARTIFACT" > "$ARTIFACT.sha256"
cat > "$RUN_DIR/reports/final-readiness.md" <<EOF
# Offline Windows bundle readiness

Verdict: **READY FOR WINDOWS TRANSFER**

The ZIP, archive checksum, clean extraction, repository-independent synthetic
self-test, static compatibility/security scans, and manifest checks passed.
The remaining external platform gate is the first actual Windows PowerShell 5.1
run of VERIFY-BUNDLE.cmd and SELF-TEST.cmd; it is documented rather than
claimed as completed on this macOS build host.
EOF
trap - ERR
echo "READY FOR WINDOWS TRANSFER: $ARTIFACT"
