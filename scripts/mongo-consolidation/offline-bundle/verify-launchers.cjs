#!/usr/bin/env node
'use strict';

// Static, dependency-free release gate for the Windows entry points. It checks
// source shape; the Windows platform smoke test remains an operator gate.
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS = ['VERIFY-BUNDLE.cmd', 'SELF-TEST.cmd', 'RUN-EVIDENCE.cmd', 'VALIDATE-RUN.cmd', 'RECONCILE-RUN.cmd'];
const POWERSHELL = ['Verify-Bundle.ps1', 'Invoke-SelfTest.ps1', 'Invoke-ProductionEvidence.ps1', 'Invoke-RunValidation.ps1', 'Invoke-RunReconciliation.ps1'];
const prohibited = /\b(?:mongosh|npm(?:\.cmd)?|node(?:\.exe)?\s+(?!.*runtime\\node-win-x64\\node\.exe)|tsx|esbuild)\b/i;

function fail(message) { throw new Error(message); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function verify(root) {
  for (const file of COMMANDS) {
    const source = read(path.join(root, file));
    if (!/set\s+"BUNDLE_ROOT=%~dp0"/i.test(source)) fail(`${file} does not resolve its own root`);
    if (!/powershell\.exe\b/i.test(source) || !/"%BUNDLE_ROOT%powershell\\/i.test(source)) fail(`${file} does not quote a bundle-relative PowerShell path`);
    if (!/set\s+"EXIT_CODE=%ERRORLEVEL%"/i.test(source) || !/exit\s+\/b\s+%EXIT_CODE%/i.test(source)) fail(`${file} does not forward the exit code`);
    if (prohibited.test(source)) fail(`${file} invokes a prohibited system tool`);
  }
  for (const file of POWERSHELL) {
    const source = read(path.join(root, 'powershell', file));
    if (!/Resolve-BundlePath/.test(source)) fail(`${file} does not resolve bundle-relative paths`);
    if (!/runtime\\node-win-x64\\node\.exe/i.test(source)) fail(`${file} does not require bundled node.exe`);
    if (!/\$LASTEXITCODE/.test(source) || !/exit\s+\$(?:exitCode|readerExitCode|collectorExitCode)/i.test(source)) fail(`${file} does not preserve a child exit code`);
    if (/\b(?:mongosh|npm|tsx|esbuild)\b/i.test(source)) fail(`${file} invokes a prohibited tool`);
  }
  const production = read(path.join(root, 'powershell', 'Invoke-ProductionEvidence.ps1'));
  for (const required of ['Read-Host', '-AsSecureString', 'MONGODB_URI', 'finally', 'Remove-Variable']) {
    if (!production.includes(required)) fail(`Invoke-ProductionEvidence.ps1 lacks secure URI control: ${required}`);
  }
  process.stdout.write('Windows launchers passed static validation.\n');
}

try {
  const args = process.argv.slice(2);
  const index = args.indexOf('--root');
  if (index < 0 || !args[index + 1]) throw new Error('Usage: verify-launchers.cjs --root <bundle-root>');
  verify(path.resolve(args[index + 1]));
} catch (error) {
  process.stderr.write(`Launcher validation failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exitCode = 1;
}
