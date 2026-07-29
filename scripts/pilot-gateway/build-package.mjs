#!/usr/bin/env node
import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..", "..");
const packageFileName = "sitebuilder-hub-builder-api-pilot-gateway.zip";
const packageDirectoryName = "sitebuilder-hub-builder-api-pilot-gateway";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
};

const runDirectory = path.resolve(argument("--run-dir"));
const baselineSha = argument("--baseline");
const allowedRunRoot = path.join(repositoryRoot, "tmp", "agent-runs") + path.sep;
if (!runDirectory.startsWith(allowedRunRoot)) {
  throw new Error(`--run-dir must be a dedicated directory below ${allowedRunRoot}`);
}
if (!/^[0-9a-f]{40}$/.test(baselineSha)) {
  throw new Error("--baseline must be a full Git commit SHA.");
}

const git = (...args) =>
  execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
const finalSha = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const changedFiles = git("diff", "--name-only", `${baselineSha}...${finalSha}`)
  .split(/\r?\n/)
  .map((item) => item.trim())
  .filter(Boolean)
  .sort();
if (!changedFiles.length) throw new Error("No committed package changes were found.");

const packageBuildRoot = path.join(runDirectory, "package-build");
const packageRoot = path.join(packageBuildRoot, packageDirectoryName);
const verificationRoot = path.join(runDirectory, "package-verification");
const zipPath = path.join(runDirectory, packageFileName);
fs.rmSync(packageBuildRoot, { recursive: true, force: true });
fs.rmSync(verificationRoot, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.rmSync(`${zipPath}.sha256`, { force: true });
fs.mkdirSync(packageRoot, { recursive: true });

const copy = (sourceRelative, destinationRelative) => {
  const source = path.join(repositoryRoot, sourceRelative);
  const destination = path.join(packageRoot, destinationRelative);
  if (!fs.existsSync(source)) throw new Error(`Required package input is missing: ${sourceRelative}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

[
  ["server/dist/app.js", "backend-patch/dist/app.js"],
  ["server/dist/index.js", "backend-patch/dist/index.js"],
  ["server/dist/config/env.js", "backend-patch/dist/config/env.js"],
  ["server/dist/config/pilotGateway.js", "backend-patch/dist/config/pilotGateway.js"],
  ["server/dist/services/pilotGateway.service.js", "backend-patch/dist/services/pilotGateway.service.js"],
  ["scripts/pilot-gateway/pilot-bootstrap.cjs", "tools/pilot-bootstrap.cjs"],
  ["scripts/pilot-gateway/CREATE-ALPHATEAM-MONGO-PILOT.cmd", "tools/CREATE-ALPHATEAM-MONGO-PILOT.cmd"],
  ["scripts/pilot-gateway/VERIFY-ALPHATEAM-MONGO-PILOT.cmd", "tools/VERIFY-ALPHATEAM-MONGO-PILOT.cmd"],
  ["scripts/pilot-gateway/ENV-PILOT-GATEWAY.example", "ENV-PILOT-GATEWAY.example"],
  ["scripts/pilot-gateway/FRONTEND-ALPHATEAM-MONGO-PILOT.env.example", "FRONTEND-ALPHATEAM-MONGO-PILOT.env.example"],
  ["scripts/pilot-gateway/WINDOWS-OPERATOR-README.md", "README-FIRST.md"]
].forEach(([source, destination]) => copy(source, destination));

fs.writeFileSync(
  path.join(packageRoot, "CHANGED-FILES.txt"),
  `${changedFiles.join("\n")}\n`,
  "utf8"
);
fs.writeFileSync(
  path.join(packageRoot, "BUILD-IDENTITY.json"),
  `${JSON.stringify({
    schemaVersion: "1",
    component: "sitebuilder-hub-builder-api-pilot-gateway",
    mode: "PILOT_ONLY",
    baselineSha,
    finalSha,
    branch,
    nodeCompatibilityTarget: "18.12.1",
    publicPrefix: "/builder-api",
    upstreamOrigin: "http://127.0.0.1:3001",
    allowedSiteIds: ["alphateam-mongo-pilot"],
    allowedOrigins: ["https://portal.army.idf"],
    includesHubFrontend: false,
    includesSecret: false,
    includesEnvironmentFile: false,
    includesData: false
  }, null, 2)}\n`,
  "utf8"
);

const walkFiles = (root, relative = "") => {
  const current = path.join(root, relative);
  return fs.readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const child = path.join(relative, entry.name);
      return entry.isDirectory() ? walkFiles(root, child) : [child.replaceAll(path.sep, "/")];
    });
};
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const initialContents = walkFiles(packageRoot).sort();
const declaredContents = [
  ...initialContents,
  "PACKAGE-CONTENTS.json",
  "SHA256SUMS.txt"
].sort();
fs.writeFileSync(
  path.join(packageRoot, "PACKAGE-CONTENTS.json"),
  `${JSON.stringify({
    schemaVersion: "1",
    files: declaredContents,
    compiledBackendPatch: declaredContents.filter((file) => file.startsWith("backend-patch/")),
    operatorEntryPoint: "README-FIRST.md",
    createHelper: "tools/CREATE-ALPHATEAM-MONGO-PILOT.cmd",
    verifyHelper: "tools/VERIFY-ALPHATEAM-MONGO-PILOT.cmd"
  }, null, 2)}\n`,
  "utf8"
);

const checksumFiles = walkFiles(packageRoot)
  .filter((file) => file !== "SHA256SUMS.txt")
  .sort();
fs.writeFileSync(
  path.join(packageRoot, "SHA256SUMS.txt"),
  checksumFiles
    .map((file) => `${sha256File(path.join(packageRoot, file))}  ${file}`)
    .join("\n") + "\n",
  "utf8"
);

const forbiddenFiles = walkFiles(packageRoot).filter((file) =>
  /(^|\/)\.env$/i.test(file)
  || /\.(?:zip|7z)$/i.test(file)
  || /cookie/i.test(path.basename(file))
);
if (forbiddenFiles.length) {
  throw new Error(`Forbidden package files found: ${forbiddenFiles.join(", ")}`);
}
const packageText = walkFiles(packageRoot)
  .filter((file) => /\.(?:js|cjs|json|md|txt|example|cmd)$/i.test(file))
  .map((file) => fs.readFileSync(path.join(packageRoot, file), "utf8"))
  .join("\n");
if (/VITE_(?:SITE_BUILDER_(?:DEV_)?API_KEY|ADMIN_API_KEY)\s*=/i.test(packageText)) {
  throw new Error("A forbidden browser secret variable was found in the package.");
}
const configuredSecret = String(process.env.SITE_BUILDER_BACKEND_API_KEY || "").trim();
if (configuredSecret && packageText.includes(configuredSecret)) {
  throw new Error("The resolved server secret was found in the package.");
}

execFileSync("zip", ["-X", "-q", "-r", zipPath, "."], { cwd: packageRoot });
const zipSha256 = sha256File(zipPath);
fs.writeFileSync(`${zipPath}.sha256`, `${zipSha256}  ${packageFileName}\n`, "utf8");

fs.mkdirSync(verificationRoot, { recursive: true });
execFileSync("unzip", ["-q", zipPath, "-d", verificationRoot]);
const manifestRows = fs.readFileSync(path.join(verificationRoot, "SHA256SUMS.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
for (const row of manifestRows) {
  const match = row.match(/^([0-9a-f]{64})  (.+)$/);
  if (!match) throw new Error(`Invalid internal checksum row: ${row}`);
  const actual = sha256File(path.join(verificationRoot, match[2]));
  if (actual !== match[1]) throw new Error(`Internal checksum verification failed: ${match[2]}`);
}

const result = {
  package: zipPath,
  sha256: zipSha256,
  sha256File: `${zipPath}.sha256`,
  packageRoot,
  verificationRoot,
  internalFilesVerified: manifestRows.length,
  baselineSha,
  finalSha,
  branch,
  changedFiles
};
fs.writeFileSync(
  path.join(runDirectory, "PACKAGE-RESULT.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
