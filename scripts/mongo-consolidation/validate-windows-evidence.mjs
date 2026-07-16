#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { generateEvidenceMarkdown, loadEvidenceDirectory, scanPowerShellPolicy, validateEvidenceBundle } from './evidence-lib.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] || fallback : fallback; };
const directory = path.resolve(value('--input', 'mongo-consolidation-evidence'));
const scriptPath = path.resolve(value('--script', path.join(import.meta.dirname, 'collect-windows-evidence.ps1')));
try {
  const policyErrors = scanPowerShellPolicy(fs.readFileSync(scriptPath, 'utf8'));
  const bundle = loadEvidenceDirectory(directory);
  const validation = validateEvidenceBundle(bundle);
  const errors = [...policyErrors, ...validation.errors];
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 40; }
  else { fs.writeFileSync(path.join(directory, 'summary.md'), generateEvidenceMarkdown(bundle), 'utf8'); console.log(`Validated sanitized evidence at ${directory}`); }
} catch (error) {
  console.error(`Evidence validation failed at ${directory}: ${error instanceof Error ? error.name : 'Error'}`);
  process.exitCode = 30;
}
