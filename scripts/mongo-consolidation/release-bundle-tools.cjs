#!/usr/bin/env node
/*
 * Release-only static checks for the offline Windows evidence bundle.  This
 * tool is deliberately dependency-free so the same file can ship in a bundle.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const textExtensions = new Set(['.cjs', '.js', '.mjs', '.ps1', '.cmd', '.json', '.md', '.txt', '.csv']);
const prohibited = [
  /\b(?:insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|replaceOne|bulkWrite|createIndex|dropIndex)\s*\(/i,
  /\b(?:mongorestore|Restart-Service|Start-Service|Stop-Service|Set-Service|Remove-Item|Clear-Content)\b/i,
  /\bdocker\s+(?:start|stop|restart|rm|rmi|kill|compose\s+(?:up|down))\b/i,
  /\$(?:out|merge)\b/i
];
const prohibitedLabels = ['mongo-write', 'system-or-filesystem-mutation', 'docker-lifecycle', 'mongo-aggregation-write'];
const secretPatterns = [
  /mongodb(?:\+srv)?:\/\/[a-z0-9_.-]+:[a-z0-9_.~%-]+@/i,
  /\b(?:api[_-]?key|bearer|cookie|digest|authorization|private[_-]?key)\s*[:=]/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /(?:^|[?&])(?:token|password|secret|sig|signature)=/i
];
const forbiddenPS = [/(?:\?\?|\?\.)/, /ForEach-Object\s+-Parallel/i, /\[IO\.Path\]::GetRelativePath/i];

function walk(root, callback) {
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) callback(full, rel, stat, true);
    else if (stat.isDirectory()) walk(full, (child, childRel, childStat, symlink) => callback(child, `${entry.name}/${childRel}`, childStat, symlink));
    else callback(full, rel, stat, false);
  }
}
function scanText(root, options = {}) {
  const findings = [];
  walk(root, (file, relative, stat, symlink) => {
    if (symlink) findings.push({ code: 'symlink', relative });
    if (!stat.isFile()) return;
    if (relative === '.env' || /(^|\/)\.env(?:\.|$)/.test(relative)) findings.push({ code: 'env-file', relative });
    if (/(^|\/)\.git(?:\/|$)/.test(relative)) findings.push({ code: 'git-metadata', relative });
    if (!textExtensions.has(path.extname(file).toLowerCase())) return;
    const text = fs.readFileSync(file, 'utf8');
    if (/\/Users\/|[A-Za-z]:\\Users\\/i.test(text)) findings.push({ code: 'absolute-user-path', relative });
    if (/\b[A-Za-z]:\\(?:Users|Documents and Settings)\\/i.test(text)) findings.push({ code: 'absolute-windows-path', relative });
    // These directories contain executable policy/reader code. Their patterns
    // and bundled MongoDB-driver internals are inspected by source allowlist
    // gates below; scanning their literals would flag the detector itself or a
    // driver routine that constructs a key in memory, rather than a secret.
    const policyCode = /^(?:collector|mongo-reader|security|validator)\//.test(relative);
    const scrubbed = text.replace(/-----BEGIN PRIVATE KEY-----\s*\$\{key\.toString\("base64"\)\}\s*-----END PRIVATE KEY-----/g, '');
    if (!options.skipSecrets && !policyCode && secretPatterns.some((pattern) => pattern.test(scrubbed))) findings.push({ code: 'secret', relative });
  });
  return findings;
}
function scanCommands(file) {
  const source = fs.readFileSync(file, 'utf8');
  const executable = source.split(/\r?\n/).filter((line) => !line.trim().startsWith('#') && !line.trim().startsWith('//')).join('\n');
  return prohibited.flatMap((pattern, index) => pattern.test(executable) ? [{ code: prohibitedLabels[index], pattern: pattern.source }] : []);
}
function json(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function fail(findings) { json({ valid: false, findings }); process.exitCode = 1; }
function requireValue(args, flag) { const i = args.indexOf(flag); if (i < 0 || !args[i + 1]) throw new Error(`missing ${flag}`); return args[i + 1]; }
function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'scan-secret') {
    const findings = scanText(requireValue(args, '--input'));
    return findings.length ? fail(findings) : json({ valid: true, findings: [] });
  }
  if (command === 'scan-command-policy') {
    const input = requireValue(args, '--input');
    const findings = [];
    const stat = fs.statSync(input);
    if (stat.isDirectory()) walk(input, (file, relative, fileStat, symlink) => {
      if (!fileStat.isFile() || symlink || relative.startsWith('security/') || relative.startsWith('fixtures/')) return;
      // mongodb is bundled into the reader and exposes mutation methods as
      // library symbols. The actual entry source is checked separately below;
      // library symbol presence is not an invocation.
      if (relative.startsWith('mongo-reader/') || relative.startsWith('validator/')) return;
      if (['.cjs', '.js', '.mjs', '.ps1', '.cmd'].includes(path.extname(file).toLowerCase())) findings.push(...scanCommands(file).map((item) => ({ ...item, relative })));
    });
    else findings.push(...scanCommands(input));
    return findings.length ? fail(findings) : json({ valid: true, findings: [] });
  }
  if (command === 'scan-ps51') {
    const root = requireValue(args, '--input'), findings = [];
    walk(root, (file, relative, stat, symlink) => {
      if (!stat.isFile() || symlink || path.extname(file).toLowerCase() !== '.ps1') return;
      let source = fs.readFileSync(file, 'utf8');
      // A PowerShell here-string may hold JavaScript for a separate runtime;
      // its syntax does not establish PowerShell 5.1 compatibility.
      source = source.replace(/@'[^]*?'@/g, '').replace(/@"[^]*?"@/g, '');
      forbiddenPS.forEach((pattern) => { if (pattern.test(source)) findings.push({ code: 'ps51-incompatible', relative, pattern: pattern.source }); });
    });
    return findings.length ? fail(findings) : json({ valid: true, findings: [] });
  }
  if (command === 'scan-launchers') {
    const root = requireValue(args, '--input'), findings = [];
    for (const name of ['VERIFY-BUNDLE.cmd', 'SELF-TEST.cmd', 'RUN-EVIDENCE.cmd', 'VALIDATE-RUN.cmd', 'RECONCILE-RUN.cmd']) {
      const file = path.join(root, name);
      if (!fs.existsSync(file)) { findings.push({ code: 'launcher-missing', relative: name }); continue; }
      const text = fs.readFileSync(file, 'utf8');
      if (!/%~dp0/i.test(text) || !/powershell\.exe/i.test(text) || /\b(?:npm|npx|mongosh|node(?:\.exe)?\s)/i.test(text)) findings.push({ code: 'launcher-policy', relative: name });
    }
    return findings.length ? fail(findings) : json({ valid: true, findings: [] });
  }
  if (command === 'hash') {
    const file = requireValue(args, '--input');
    return process.stdout.write(`${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}\n`);
  }
  throw new Error('unknown command');
}
try { main(); } catch (error) { process.stderr.write(`Release bundle check failed: ${error.message}\n`); process.exitCode = 2; }
