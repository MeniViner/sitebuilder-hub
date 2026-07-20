#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const unsupportedPatterns = [
  { name: 'null-conditional operator', pattern: /\?\./ },
  { name: 'null-coalescing operator', pattern: /\?\?/ },
  { name: 'PowerShell parallel foreach', pattern: /\bForEach-Object\s+-Parallel\b/i },
  { name: 'PowerShell ternary operator', pattern: /\s\?\s+[^\r\n]+\s:\s/ },
  { name: 'PowerShell 6 ConvertFrom-Json option', pattern: /\bConvertFrom-Json\s+-AsHashtable\b/i },
  { name: 'PowerShell 7 Get-Error', pattern: /\bGet-Error\b/i },
  { name: 'unsupported Path.GetRelativePath', pattern: /\[IO\.Path\]::GetRelativePath\b/i },
  { name: 'PowerShell 6 Join-Path option', pattern: /\bJoin-Path\s+-AdditionalChildPath\b/i },
];

function executableLines(source) {
  const result = [];
  let hereStringTerminator = null;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (hereStringTerminator) {
      if (trimmed === hereStringTerminator) hereStringTerminator = null;
      continue;
    }
    if (trimmed.endsWith("@'")) { hereStringTerminator = "'@"; continue; }
    if (trimmed.endsWith('@"')) { hereStringTerminator = '"@'; continue; }
    if (!trimmed.startsWith('#')) result.push({ line, lineNumber: index + 1 });
  }
  return result;
}

export function scanPowerShell51(source, filename = '<memory>') {
  const findings = [];
  for (const { line, lineNumber } of executableLines(source)) {
    for (const { name, pattern } of unsupportedPatterns) {
      if (pattern.test(line)) findings.push(`${filename}:${lineNumber}: ${name}`);
    }
  }
  return findings;
}

export function scanPowerShellTree(root) {
  const findings = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ps1')) {
        findings.push(...scanPowerShell51(fs.readFileSync(fullPath, 'utf8'), path.relative(root, fullPath).replaceAll(path.sep, '/')));
      }
    }
  };
  visit(root);
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const findings = scanPowerShellTree(root);
  if (findings.length) {
    process.stderr.write(`${findings.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('PowerShell 5.1 static compatibility scan passed.\n');
  }
}
