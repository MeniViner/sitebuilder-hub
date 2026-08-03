#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runDirectory = path.resolve(process.argv[2] || "");
if (!runDirectory.split(path.sep).includes("agent-runs") || !runDirectory.includes(`${path.sep}tmp${path.sep}`)) {
  throw new Error("Pass a dedicated run directory below tmp/agent-runs.");
}

const deployRoot = path.join(runDirectory, "artifacts", "deploy-ready");
const serverRoot = path.join(deployRoot, "server-dist");
const hash = (contents) => createHash("sha256").update(contents).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(current, entry.name);
    return entry.isDirectory() ? walk(root, target) : [target];
  }));
  return files.flat();
}

function destinationFor(relative) {
  if (relative.startsWith("client-dist/")) return `HUB client dist/${relative.slice("client-dist/".length)}`;
  if (relative.startsWith("server-dist/")) return `HUB server/${relative.slice("server-dist/".length)}`;
  return `HUB release metadata/${relative}`;
}

await rm(deployRoot, { recursive: true, force: true });
await mkdir(serverRoot, { recursive: true });
await cp(path.join(repositoryRoot, "client", "dist"), path.join(deployRoot, "client-dist"), { recursive: true });
await cp(path.join(repositoryRoot, "server", "dist"), path.join(serverRoot, "dist"), { recursive: true });
for (const file of ["package.json", "package-lock.json"]) {
  await cp(path.join(repositoryRoot, "server", file), path.join(serverRoot, file));
  await cp(path.join(repositoryRoot, file), path.join(deployRoot, file));
}

execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts"], { cwd: serverRoot, stdio: "inherit" });
await rm(path.join(deployRoot, "package.json"));
await rm(path.join(deployRoot, "package-lock.json"));

const serverModules = await walk(path.join(serverRoot, "node_modules"));
const forbiddenNative = serverModules.filter((file) => /\.(?:node|dylib)$/i.test(file));
const forbiddenDarwin = serverModules.filter((file) => /(?:^|[\\/])[^\\/]*darwin(?:[^\\/]*)(?:[\\/]|$)/i.test(file));
const forbiddenBuildTools = serverModules.filter((file) => /(?:^|[\\/])(?:vite|typescript|rollup|esbuild|@fontsource)(?:[\\/]|$)/i.test(file));
if (forbiddenNative.length || forbiddenDarwin.length || forbiddenBuildTools.length) {
  throw new Error(`Windows deployment dependency scan failed: ${JSON.stringify({ forbiddenNative, forbiddenDarwin, forbiddenBuildTools })}`);
}

const sourceCommit = git("rev-parse", "HEAD");
const compatibility = {
  sourceCommit,
  nodeTarget: "18.12.1",
  client: {
    prebuilt: true,
    requiresWindowsBuildTools: false,
    excludedBuildTools: ["Vite", "TypeScript", "Rollup", "esbuild", "@fontsource", "npm"]
  },
  server: {
    productionDependenciesLocked: true,
    installation: "npm ci --omit=dev --ignore-scripts from canonical server/package-lock.json on the release builder",
    nativeDependencies: [],
    darwinPackages: [],
    windowsX64VariantsRequired: []
  }
};
await writeFile(path.join(deployRoot, "SOURCE-COMMIT.txt"), `${sourceCommit}\n`, "utf8");
await writeFile(path.join(deployRoot, "WINDOWS-COMPATIBILITY.json"), `${JSON.stringify(compatibility, null, 2)}\n`, "utf8");
await writeFile(path.join(deployRoot, "README-FIRST.md"), `# HUB Windows deployment\n\nCopy every listed file exactly as mapped in \`REPLACE-MANIFEST.json\`. The client is already built; do not run npm, Vite, TypeScript, Rollup, esbuild, or a client build on Windows. The server is already compiled and includes locked production runtime dependencies for Node 18.12.1.\n\nBefore starting the server, copy values from the included environment examples separately and set the deployed server environment. Do not copy a real .env from this package because none is included.\n`, "utf8");
const generatedFiles = await walk(deployRoot);
const manifest = [];
for (const file of generatedFiles.sort()) {
  const relative = path.relative(deployRoot, file).split(path.sep).join("/");
  const contents = await readFile(file);
  manifest.push({ source: relative, destination: destinationFor(relative), bytes: (await stat(file)).size, sha256: hash(contents) });
}
await writeFile(path.join(deployRoot, "REPLACE-MANIFEST.json"), `${JSON.stringify({ schemaVersion: 1, replaceAllListedFiles: true, entries: manifest }, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ deployRoot, sourceCommit, replaceFiles: manifest.length, compatibility }, null, 2)}\n`);
