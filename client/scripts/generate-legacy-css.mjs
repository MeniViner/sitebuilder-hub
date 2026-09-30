import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const LEGACY_BASELINE_SHA = "53488763b0a460613a639f5b0d7b2301a821ccd1";
const LEGACY_SOURCE = "client/src/styles/index.css";
const marker = 'html[data-hub-ui-mode="legacy"]';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const outputPath = path.join(repositoryRoot, "client/src/styles/legacy.css");

function isInsideKeyframes(rule) {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return true;
    parent = parent.parent;
  }
  return false;
}

function scopeSelector(selector) {
  const value = selector.trim();
  if (value.startsWith(":root")) return `${marker}${value.slice(5)}`;
  if (/^html(?=$|[\s.:[#>+~])/.test(value)) return value.replace(/^html/, marker);
  if (/^body(?=$|[\s.:[#>+~])/.test(value)) return `${marker} ${value}`;
  if (/^\[data-theme=/.test(value)) return value.replace(/^(\[data-theme=[^\]]+\])/, `${marker}$1`);
  return `${marker} ${value}`;
}

const legacySource = execFileSync("git", ["show", `${LEGACY_BASELINE_SHA}:${LEGACY_SOURCE}`], {
  cwd: repositoryRoot,
  encoding: "utf8"
});
const root = postcss.parse(legacySource, { from: `${LEGACY_BASELINE_SHA}:${LEGACY_SOURCE}` });

root.walkAtRules("tailwind", (rule) => rule.remove());
root.walkRules((rule) => {
  if (isInsideKeyframes(rule)) return;
  const selectors = [];
  selectorParser((parsed) => parsed.each((selector) => selectors.push(scopeSelector(selector.toString()))))
    .processSync(rule.selector);
  rule.selector = selectors.join(",\n");
});

const provenance = [
  "/*",
  " * Exact scoped legacy stylesheet generated from:",
  ` * ${LEGACY_BASELINE_SHA}:${LEGACY_SOURCE}`,
  " * Regenerate with: npm --prefix client run generate:legacy-css",
  " */",
  ""
].join("\n");

writeFileSync(outputPath, `${provenance}${root.toString().trim()}\n`, "utf8");
