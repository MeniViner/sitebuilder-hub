#!/usr/bin/env node
'use strict';

/*
 * The offline bundle must be verifiable without npm or any repository files.
 * This file is intentionally plain CommonJS and only uses Node built-ins.
 *
 * File hashing rule:
 *   - BUNDLE-MANIFEST.json describes every regular file other than itself and
 *     SHA256SUMS.txt (a manifest cannot meaningfully contain its own hash).
 *   - SHA256SUMS.txt hashes every regular file other than SHA256SUMS.txt,
 *     including BUNDLE-MANIFEST.json, in bytewise ordinal path order.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const MANIFEST_NAME = 'BUNDLE-MANIFEST.json';
const SUMS_NAME = 'SHA256SUMS.txt';
const CONTROL_FILES = new Set([MANIFEST_NAME, SUMS_NAME]);
const CATEGORIES = new Set([
  'documentation', 'metadata', 'launcher', 'powershell', 'collector',
  'mongo-reader', 'validator', 'reconciliation', 'self-test', 'schema',
  'policy', 'fixture', 'runtime', 'license', 'temporary',
]);
const EXECUTABLE_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1', '.js', '.cjs', '.mjs', '.exe']);

function fail(message) { throw new Error(message); }
function usage() {
  process.stderr.write('Usage: manifest-tool.cjs create --root <directory> --version <VERSION.json> | verify --root <directory>\n');
  process.exitCode = 2;
}
function getArg(args, name, required = true) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) fail(`Missing ${name}`);
  return value;
}
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}
function relativePath(root, file) {
  const result = path.relative(root, file).split(path.sep).join('/');
  if (!result || result.startsWith('../') || path.isAbsolute(result) || result.includes('\\')) fail(`Unsafe relative path: ${result || file}`);
  return result;
}
function listRegularFiles(root) {
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) fail(`Symlink is not allowed: ${relativePath(root, full)}`);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) result.push({ full, relativePath: relativePath(root, full), stat });
      else fail(`Unsupported filesystem entry: ${relativePath(root, full)}`);
    }
  }
  walk(root);
  return result.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
}
function categoryFor(relative) {
  const first = relative.split('/')[0];
  const byTopLevel = {
    'README-FIRST.md': 'documentation', 'VERSION.json': 'metadata',
    'THIRD-PARTY-NOTICES.md': 'license', 'licenses': 'license',
    'powershell': 'powershell', 'collector': 'collector', 'mongo-reader': 'mongo-reader',
    'validator': 'validator', 'reconciliation': 'reconciliation', 'self-test': 'self-test',
    'schemas': 'schema', 'policies': 'policy', 'fixtures': 'fixture',
    'runtime': 'runtime', 'tmp': 'temporary',
  };
  if (/^[A-Z-]+\.cmd$/i.test(relative)) return 'launcher';
  return byTopLevel[first] || byTopLevel[relative] || 'metadata';
}
function sourceTypeFor(relative) {
  const ext = path.extname(relative).toLowerCase();
  if (ext === '.exe') return 'third-party-runtime';
  if (['.js', '.cjs', '.mjs'].includes(ext)) return 'compiled-javascript';
  if (ext === '.ps1') return 'powershell-source';
  if (['.cmd', '.bat'].includes(ext)) return 'cmd-source';
  if (ext === '.json') return 'json';
  if (ext === '.md' || ext === '.txt') return 'text';
  return 'binary';
}
function isEntryPoint(relative) {
  return /^[A-Z-]+\.cmd$/i.test(relative) || relative === 'runtime/node-win-x64/node.exe';
}
function loadVersion(versionFile) {
  let version;
  try { version = JSON.parse(fs.readFileSync(versionFile, 'utf8')); } catch (_) { fail(`Invalid VERSION.json: ${versionFile}`); }
  for (const field of ['bundleVersion', 'nodeVersion', 'sourceSha', 'readinessVerdict']) {
    if (typeof version[field] !== 'string' || !version[field]) fail(`VERSION.json missing string ${field}`);
  }
  return version;
}
function create(root, versionFile) {
  root = path.resolve(root);
  if (!fs.statSync(root).isDirectory()) fail(`Bundle root is not a directory: ${root}`);
  const manifestPath = path.join(root, MANIFEST_NAME);
  const sumsPath = path.join(root, SUMS_NAME);
  if (fs.existsSync(manifestPath) || fs.existsSync(sumsPath)) fail('Control files must not exist before manifest generation');
  const version = loadVersion(versionFile);
  const files = listRegularFiles(root).filter((item) => !CONTROL_FILES.has(item.relativePath)).map((item) => ({
    relativePath: item.relativePath,
    sizeBytes: item.stat.size,
    sha256: sha256File(item.full),
    category: categoryFor(item.relativePath),
    sourceType: sourceTypeFor(item.relativePath),
    executableEntryPoint: isEntryPoint(item.relativePath),
  }));
  const manifest = {
    schemaVersion: 1,
    hashRule: 'SHA-256 of exact file bytes; paths sorted by ordinal UTF-8 code unit order; BUNDLE-MANIFEST.json and SHA256SUMS.txt excluded from manifest entries.',
    bundleVersion: version.bundleVersion,
    files,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const sumLines = listRegularFiles(root).filter((item) => item.relativePath !== SUMS_NAME)
    .map((item) => `${sha256File(item.full)} *${item.relativePath}`);
  fs.writeFileSync(sumsPath, `${sumLines.join('\n')}\n`, 'utf8');
  process.stdout.write(`Generated ${files.length} manifest entries and ${sumLines.length} checksum entries.\n`);
}
function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) fail('Invalid BUNDLE-MANIFEST.json schemaVersion/files');
  if (typeof manifest.hashRule !== 'string' || !manifest.hashRule) fail('Invalid BUNDLE-MANIFEST.json hashRule');
  const seen = new Set();
  let previous = '';
  for (const item of manifest.files) {
    if (!item || typeof item !== 'object') fail('Invalid manifest entry');
    const { relativePath: rel, sizeBytes, sha256, category, sourceType, executableEntryPoint } = item;
    if (typeof rel !== 'string' || !rel || rel.includes('\\') || rel.startsWith('/') || rel.startsWith('../') || rel.includes('/../')) fail(`Invalid manifest path: ${String(rel)}`);
    if (CONTROL_FILES.has(rel)) fail(`Control file cannot be a manifest entry: ${rel}`);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) fail(`Invalid size for ${rel}`);
    if (!/^[a-f0-9]{64}$/.test(sha256)) fail(`Invalid SHA-256 for ${rel}`);
    if (!CATEGORIES.has(category)) fail(`Invalid category for ${rel}`);
    if (typeof sourceType !== 'string' || !sourceType) fail(`Invalid sourceType for ${rel}`);
    if (typeof executableEntryPoint !== 'boolean') fail(`Invalid executableEntryPoint for ${rel}`);
    if (seen.has(rel) || previous >= rel) fail(`Manifest paths must be unique and ordinally sorted: ${rel}`);
    seen.add(rel); previous = rel;
  }
  return seen;
}
function parseSums(text) {
  const lines = text.trimEnd().split('\n');
  if (!lines.length || !lines[0]) fail('SHA256SUMS.txt is empty');
  const records = [];
  let previous = '';
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) \*([^\\\r\n]+)$/.exec(line);
    if (!match) fail(`Invalid SHA256SUMS.txt line: ${line}`);
    const rel = match[2];
    if (rel === SUMS_NAME || rel.startsWith('/') || rel.startsWith('../') || rel.includes('/../')) fail(`Unsafe checksum path: ${rel}`);
    if (previous >= rel) fail(`Checksum paths must be ordinally sorted: ${rel}`);
    previous = rel; records.push({ sha256: match[1], relativePath: rel });
  }
  return records;
}
function checkRuntime(root, version) {
  const nodeExe = path.join(root, 'runtime', 'node-win-x64', 'node.exe');
  if (!fs.existsSync(nodeExe)) fail('Bundled Windows node.exe is missing');
  if (!/^v\d+\.\d+\.\d+$/.test(version.nodeVersion)) fail('VERSION.json nodeVersion must be vMAJOR.MINOR.PATCH');
  if (process.platform === 'win32') {
    const actual = childProcess.execFileSync(nodeExe, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
    if (actual !== version.nodeVersion) fail(`Bundled node.exe version mismatch: expected ${version.nodeVersion}, received ${actual}`);
  }
}
function verify(root) {
  root = path.resolve(root);
  const manifestPath = path.join(root, MANIFEST_NAME);
  const sumsPath = path.join(root, SUMS_NAME);
  const versionPath = path.join(root, 'VERSION.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(sumsPath) || !fs.existsSync(versionPath)) fail('Bundle control files are missing');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) { fail('Invalid BUNDLE-MANIFEST.json JSON'); }
  const expected = validateManifest(manifest);
  const files = listRegularFiles(root);
  const actual = new Map(files.map((item) => [item.relativePath, item]));
  for (const rel of expected) {
    const item = actual.get(rel);
    if (!item) fail(`Manifest file is missing: ${rel}`);
    const expectedEntry = manifest.files.find((entry) => entry.relativePath === rel);
    if (item.stat.size !== expectedEntry.sizeBytes || sha256File(item.full) !== expectedEntry.sha256) fail(`Manifest checksum mismatch: ${rel}`);
  }
  const allowed = new Set([...expected, MANIFEST_NAME, SUMS_NAME]);
  for (const rel of actual.keys()) if (!allowed.has(rel)) fail(`Unexpected bundle file: ${rel}`);
  const sums = parseSums(fs.readFileSync(sumsPath, 'utf8'));
  const sumPaths = new Set(sums.map((entry) => entry.relativePath));
  if (sumPaths.size !== sums.length) fail('Duplicate SHA256SUMS.txt path');
  for (const rel of actual.keys()) {
    if (rel === SUMS_NAME) continue;
    if (!sumPaths.has(rel)) fail(`Checksum is missing: ${rel}`);
  }
  if (sumPaths.size !== actual.size - 1) fail('SHA256SUMS.txt contains unexpected path');
  for (const entry of sums) {
    const item = actual.get(entry.relativePath);
    if (!item || sha256File(item.full) !== entry.sha256) fail(`SHA256SUMS.txt mismatch: ${entry.relativePath}`);
  }
  checkRuntime(root, loadVersion(versionPath));
  process.stdout.write('Bundle manifest and checksums verified.\n');
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'create') create(getArg(args, '--root'), getArg(args, '--version'));
  else if (command === 'verify') verify(getArg(args, '--root'));
  else usage();
} catch (error) {
  process.stderr.write(`Bundle verification failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exitCode = 1;
}
