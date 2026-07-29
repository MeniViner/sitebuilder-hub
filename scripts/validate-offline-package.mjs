import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_ENVIRONMENT_EXAMPLES = [
  ".env.example",
  "client/.env.example",
  "server/.env.example"
];

const EXPECTED_PROJECT_FILES = [
  "README-FIRST.md",
  "ARCHIVE-METADATA.json",
  "CHANGED-FILES.txt",
  "package.json",
  "package-lock.json",
  "docker-compose.yml",
  "client/package.json",
  "client/package-lock.json",
  "client/public/hub-config.js",
  "client/src/config/viewMode.ts",
  "client/src/components/LegacyAppShell.tsx",
  "client/src/styles/legacy.css",
  "client/dist/index.html",
  "server/package.json",
  "server/package-lock.json",
  "server/src/index.ts",
  "server/dist/index.js",
  "scripts/validate-offline-package.mjs"
];

const excludedDirectoryNames = new Set([
  ".git",
  ".idea",
  ".vscode",
  ".cache",
  ".playwright-artifacts",
  "__MACOSX",
  "__pycache__",
  "coverage",
  "node_modules"
]);

const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".lock",
  ".md",
  ".mjs",
  ".ps1",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

const secretPatterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Mongo URI with credentials", pattern: /mongodb(?:\+srv)?:\/\/[^/\s:@]+:[^@\s/]+@/i },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "long literal authorization/cookie value", pattern: /\b(?:authorization|cookie)\s*[:=]\s*["'](?:bearer\s+)?[A-Za-z0-9+/_=-]{32,}["']/i }
];

const normalizeRelativePath = (value) => value.split(path.sep).join("/");

export function isEnvironmentTemplate(relativePath) {
  const name = path.posix.basename(normalizeRelativePath(relativePath)).toLowerCase();
  return name.endsWith(".env.example")
    || name.startsWith(".env.") && (name.endsWith(".example") || name.endsWith(".template"))
    || name === ".env.example"
    || name === ".env.template";
}

export function isRealEnvironmentFile(relativePath) {
  if (isEnvironmentTemplate(relativePath)) return false;
  const name = path.posix.basename(normalizeRelativePath(relativePath)).toLowerCase();
  return name === ".env"
    || name.startsWith(".env.")
    || /\.env(?:\.[a-z0-9_-]+)?$/.test(name);
}

function excludedReason(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  if (segments.some((segment) => excludedDirectoryNames.has(segment))) return "excluded directory";
  if (normalized === "tmp" || normalized.startsWith("tmp/")) return "temporary output";
  if (normalized === "mds/artifacts" || normalized.startsWith("mds/artifacts/")) return "production evidence";
  if (/\.log$/i.test(normalized)) return "log file";
  if (segments.some((segment) => segment === ".DS_Store" || segment.startsWith("._"))) return "OS metadata";
  return null;
}

async function walk(rootDirectory, currentDirectory = rootDirectory, files = [], violations = []) {
  for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
    const absolutePath = path.join(currentDirectory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(rootDirectory, absolutePath));
    const reason = excludedReason(relativePath);
    if (reason) violations.push({ path: relativePath, reason });
    if (entry.isSymbolicLink()) {
      violations.push({ path: relativePath, reason: "symbolic link" });
      continue;
    }
    if (entry.isDirectory()) {
      if (reason) continue;
      await walk(rootDirectory, absolutePath, files, violations);
    } else {
      files.push(relativePath);
    }
  }
  return { files, violations };
}

async function scanSecrets(rootDirectory, files) {
  const findings = [];
  for (const relativePath of files) {
    const absolutePath = path.join(rootDirectory, relativePath);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > 5 * 1024 * 1024 || !textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
    const content = await readFile(absolutePath, "utf8");
    for (const candidate of secretPatterns) {
      if (candidate.pattern.test(content)) findings.push({ path: relativePath, pattern: candidate.name });
    }
  }
  return findings;
}

async function compiledUiChecks(rootDirectory, files) {
  const assetFiles = files.filter((file) => file.startsWith("client/dist/assets/") && /\.(?:js|css)$/.test(file));
  const compiled = (await Promise.all(assetFiles.map((file) => readFile(path.join(rootDirectory, file), "utf8")))).join("\n");
  return {
    assetFiles: assetFiles.length,
    modernLabel: compiled.includes("תצוגה ישנה"),
    legacyLabel: compiled.includes("חזרה לתצוגה החדשה"),
    storageKey: compiled.includes("sitebuilder-hub-ui-mode"),
    modernValue: compiled.includes("modern"),
    legacyValue: compiled.includes("legacy"),
    scopedLegacyCss: compiled.includes('data-hub-ui-mode="legacy"') || compiled.includes("data-hub-ui-mode=legacy")
  };
}

export async function validateOfflinePackage(rootDirectory) {
  const resolvedRoot = path.resolve(rootDirectory);
  const { files, violations: excludedContent } = await walk(resolvedRoot);
  const fileSet = new Set(files);
  const realEnvironmentFiles = files.filter(isRealEnvironmentFile);
  const environmentExamples = files.filter(isEnvironmentTemplate).sort();
  const missingEnvironmentExamples = EXPECTED_ENVIRONMENT_EXAMPLES.filter((file) => !fileSet.has(file));
  const missingProjectFiles = EXPECTED_PROJECT_FILES.filter((file) => !fileSet.has(file));
  const secretFindings = await scanSecrets(resolvedRoot, files);
  const compiledUi = await compiledUiChecks(resolvedRoot, files);
  const compiledUiValid = Object.entries(compiledUi)
    .filter(([key]) => key !== "assetFiles")
    .every(([, value]) => value === true) && compiledUi.assetFiles > 0;
  const ok = realEnvironmentFiles.length === 0
    && missingEnvironmentExamples.length === 0
    && missingProjectFiles.length === 0
    && excludedContent.length === 0
    && secretFindings.length === 0
    && compiledUiValid;

  return {
    ok,
    root: resolvedRoot,
    fileCount: files.length,
    environmentExamples,
    realEnvironmentFiles,
    missingEnvironmentExamples,
    missingProjectFiles,
    excludedContent,
    secretFindings,
    compiledUi
  };
}

async function main() {
  const rootDirectory = process.argv[2];
  if (!rootDirectory) throw new Error("Usage: node scripts/validate-offline-package.mjs <extracted-package-root>");
  const result = await validateOfflinePackage(rootDirectory);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
