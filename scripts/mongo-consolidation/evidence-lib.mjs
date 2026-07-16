import fs from 'node:fs';
import path from 'node:path';

const secretKey = /(password|passwd|secret|token|api[-_]?key|authorization|cookie|digest|credential|connection[-_]?string|private[-_]?key|mongo.*uri)/i;
const secretValue = /(mongodb(?:\+srv)?:\/\/[^\s/@:]+:[^\s/@]+@|authorization\s*[:=]|bearer\s+[a-z0-9._~+\/-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;
const secretQuery = /[?&](?:token|api[-_]?key|password|secret|sig|signature|code)=/i;

export function findSecretViolations(value, location = '$', output = []) {
  if (Array.isArray(value)) value.forEach((item, index) => findSecretViolations(item, `${location}[${index}]`, output));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childLocation = `${location}.${key}`;
      if (secretKey.test(key) && child !== null && child !== '' && child !== false) output.push(childLocation);
      findSecretViolations(child, childLocation, output);
    }
  } else if (typeof value === 'string' && (secretValue.test(value) || secretQuery.test(value))) output.push(location);
  return [...new Set(output)];
}

export function validateEvidenceBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.schemaVersion !== 1) errors.push('$.schemaVersion must equal 1');
  if (!bundle?.collectedAt || Number.isNaN(Date.parse(bundle.collectedAt))) errors.push('$.collectedAt must be an ISO timestamp');
  for (const section of ['system', 'services', 'ports', 'docker', 'iis', 'mongo', 'runtimeConfigs', 'backups', 'mappingInput']) {
    if (!(section in (bundle || {}))) errors.push(`$.${section} is required`);
  }
  for (const location of findSecretViolations(bundle)) errors.push(`${location} contains a likely secret`);
  if (Array.isArray(bundle?.docker)) bundle.docker.forEach((entry, index) => {
    if ('environment' in entry || 'envValues' in entry) errors.push(`$.docker[${index}] must contain environmentNames only`);
  });
  return { valid: errors.length === 0, errors };
}

export const PROHIBITED_EVIDENCE_COMMANDS = [
  /\b(?:Restart|Start|Stop|Set|New|Remove)-Service\b/i,
  /\b(?:Register|Unregister|Set|Start|Stop)-ScheduledTask\b/i,
  /\b(?:New|Remove|Set)-(?:Website|WebBinding|WebAppPool)\b/i,
  /\bdocker\s+(?:start|stop|restart|rm|rmi|kill|compose\s+(?:up|down))\b/i,
  /\b(?:insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|bulkWrite|createIndex|dropIndex|renameCollection)\s*\(/i,
  /\b(?:mongorestore|Remove-Item|Clear-Content)\b/i,
];

export function scanPowerShellPolicy(source) {
  const executable = source.split(/\r?\n/).filter((line) => !line.trim().startsWith('#')).join('\n');
  return PROHIBITED_EVIDENCE_COMMANDS.filter((pattern) => pattern.test(executable)).map((pattern) => `Prohibited command pattern: ${pattern.source}`);
}

export function generateEvidenceMarkdown(bundle) {
  const count = (value) => Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0;
  return ['# Mongo consolidation production evidence summary', '', `Collected at: ${bundle.collectedAt}`,
    `Collector host alias: ${bundle.collectorHostAlias || 'unavailable'}`, '', '| Category | Records |', '| --- | ---: |',
    `| Services | ${count(bundle.services)} |`, `| Listening ports | ${count(bundle.ports)} |`,
    `| Docker containers | ${count(bundle.docker)} |`, `| IIS sites | ${count(bundle.iis)} |`,
    `| Mongo databases | ${count(bundle.mongo?.databases)} |`, `| Runtime configs | ${count(bundle.runtimeConfigs)} |`,
    `| Backup artifacts | ${count(bundle.backups)} |`, '',
    '> This summary is generated from validated, sanitized JSON. It contains no payloads or credentials.', ''].join('\n');
}

export function normalizePowerShellJson(text, array = false) {
  const parsed = JSON.parse(String(text).replace(/^\uFEFF/, '').trim());
  return array && !Array.isArray(parsed) ? [parsed] : parsed;
}

export function loadEvidenceDirectory(directory) {
  const read = (name) => normalizePowerShellJson(fs.readFileSync(path.join(directory, name), 'utf8'));
  const meta = read('system.json');
  return { schemaVersion: 1, collectedAt: meta.collectedAt, collectorHostAlias: meta.collectorHostAlias, system: meta.system,
    services: read('services.json'), ports: read('ports.json'), docker: read('docker.json'), iis: read('iis.json'),
    mongo: read('mongo.json'), runtimeConfigs: read('runtime-configs.json'), backups: read('backups.json'), mappingInput: read('mapping-input.json') };
}
