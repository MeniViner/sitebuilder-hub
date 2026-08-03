#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runDirectory = path.resolve(process.argv[2] || "");
if (!runDirectory.split(path.sep).includes("agent-runs") || !runDirectory.includes(`${path.sep}tmp${path.sep}`)) {
  throw new Error("Pass a dedicated run directory below tmp/agent-runs.");
}
const git = (...args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
if (git("status", "--porcelain")) throw new Error("Canonical worktree must be clean before archiving.");

const sourceCommit = git("rev-parse", "HEAD");
const baselineCommit = "53488763b0a460613a639f5b0d7b2301a821ccd1";
const artifactDirectory = path.join(runDirectory, "artifacts");
const stageRoot = path.join(artifactDirectory, "source-stage");
const sourceRoot = path.join(stageRoot, "sitebuilder-hub-canonical-latest");
const archive = path.join(artifactDirectory, "sitebuilder-hub-canonical-latest.7z");
await rm(stageRoot, { recursive: true, force: true });
await rm(archive, { force: true });
await rm(`${archive}.sha256`, { force: true });
await mkdir(sourceRoot, { recursive: true });

const sourceTar = path.join(artifactDirectory, "canonical-source.tar");
await rm(sourceTar, { force: true });
execFileSync("git", ["archive", "--format=tar", "--output", sourceTar, sourceCommit], { cwd: repositoryRoot });
execFileSync("tar", ["-xf", sourceTar, "-C", sourceRoot]);
await rm(sourceTar, { force: true });
await rm(path.join(sourceRoot, "dev-monitoring.err.log"), { force: true });
await rm(path.join(sourceRoot, "dev-monitoring.out.log"), { force: true });
await rm(path.join(sourceRoot, "mds", "artifacts"), { recursive: true, force: true });
await cp(path.join(repositoryRoot, "client", "dist"), path.join(sourceRoot, "client", "dist"), { recursive: true });
await cp(path.join(repositoryRoot, "server", "dist"), path.join(sourceRoot, "server", "dist"), { recursive: true });

const changedFiles = git("diff", "--name-only", `${baselineCommit}...${sourceCommit}`).split(/\r?\n/).filter(Boolean).sort();
const metadata = {
  schemaVersion: 1,
  sourceCommit,
  branch: git("branch", "--show-current"),
  baselineCommit,
  includes: ["canonical source", "client/scripts", "client/dist", "server/dist", "Gateway helpers", "environment examples", "deployment scripts", "documentation"],
  excludes: [".git", "real .env", "tmp/agent-runs", "logs", "caches", "screenshots", "node_modules", "production evidence", "secrets"]
};
await writeFile(path.join(sourceRoot, "ARCHIVE-METADATA.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
await writeFile(path.join(sourceRoot, "CHANGED-FILES.txt"), `${changedFiles.join("\n")}\n`, "utf8");
await writeFile(path.join(sourceRoot, "README-FIRST.md"), `# Canonical HUB source release\n\nSource commit: \`${sourceCommit}\`\n\nThis is the complete canonical source plus prebuilt client and server outputs. For the closed Windows deployment, use the sibling \`deploy-ready/\` folder; do not rebuild this archive on Windows.\n`, "utf8");

execFileSync("7zz", ["a", "-t7z", archive, path.basename(sourceRoot)], { cwd: stageRoot, stdio: "inherit" });
const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ archive, sha256: digest, sourceRoot, sourceCommit, changedFiles: changedFiles.length }, null, 2)}\n`);
