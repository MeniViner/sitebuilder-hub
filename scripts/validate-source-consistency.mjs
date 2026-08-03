#!/usr/bin/env node
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  ".env.example",
  "client/.env.example",
  "server/.env.example",
  "client/scripts/generate-modern-css.mjs",
  "client/scripts/generate-legacy-css.mjs",
  "server/src/config/pilotGateway.ts",
  "server/src/services/pilotGateway.service.ts",
  "client/src/config/viewMode.ts",
  "client/src/components/HubViewToggle.tsx"
];
const sourceRoots = ["client/src", "server/src", "tests", "scripts"];
const sourceExtensions = [".ts", ".tsx", ".d.ts", ".js", ".mjs", ".cjs"];
const failures = [];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return sourceExtensions.includes(path.extname(entry.name)) ? [target] : [];
  }));
  return nested.flat();
}

async function resolveLocalImport(fromFile, specifier) {
  const candidate = path.resolve(path.dirname(fromFile), specifier);
  const options = [candidate, ...sourceExtensions.map((extension) => `${candidate}${extension}`), ...sourceExtensions.map((extension) => path.join(candidate, `index${extension}`))];
  return (await Promise.all(options.map(async (option) => ((await exists(option)) ? option : null)))).find(Boolean);
}

function commandTargets(script) {
  return [...script.matchAll(/(?:node|tsx)\s+(?:\.\/)?([^\s"']+\.(?:[cm]?js|ts))/g)].map((match) => match[1]);
}

for (const relative of requiredFiles) {
  if (!await exists(path.join(root, relative))) failures.push(`Missing required file: ${relative}`);
}

for (const manifest of ["package.json", "server/package.json", "client/package.json"]) {
  const packageJson = JSON.parse(await readFile(path.join(root, manifest), "utf8"));
  const lockfile = JSON.parse(await readFile(path.join(root, path.join(path.dirname(manifest), "package-lock.json")), "utf8"));
  const lockedPackage = lockfile.packages?.[""];
  if (!lockedPackage || lockedPackage.name !== packageJson.name || lockedPackage.version !== packageJson.version) {
    failures.push(`package.json and package-lock.json disagree: ${manifest}`);
  }
  for (const [name, script] of Object.entries(packageJson.scripts || {})) {
    for (const target of commandTargets(script)) {
      const relative = path.normalize(path.join(path.dirname(manifest), target));
      if (relative.includes(`${path.sep}node_modules${path.sep}`)) continue;
      if (!await exists(path.join(root, relative))) failures.push(`Missing npm script target (${manifest}:${name}): ${relative}`);
    }
  }
}

for (const sourceRoot of sourceRoots) {
  for (const file of await walk(path.join(root, sourceRoot))) {
    const content = await readFile(file, "utf8");
    const imports = [...content.matchAll(/(?:from\s*|import\s*|require\()\s*["'](\.[^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of imports) {
      if (!await resolveLocalImport(file, specifier)) failures.push(`Missing local import: ${path.relative(root, file)} -> ${specifier}`);
    }
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Source consistency validation passed.\n");
}
