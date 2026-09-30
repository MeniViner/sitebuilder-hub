import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const marker = 'html[data-hub-ui-mode="modern"]';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const sourcePath = path.join(repositoryRoot, "client/src/styles/index.css");
const outputPath = path.join(repositoryRoot, "client/src/styles/modern.css");

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

const modernSource = readFileSync(sourcePath, "utf8");
const root = postcss.parse(modernSource, { from: sourcePath });

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
  " * Generated modern-only stylesheet.",
  " * Source: client/src/styles/index.css",
  " * Regenerate with: npm --prefix client run generate:modern-css",
  " */",
  ""
].join("\n");

writeFileSync(outputPath, `${provenance}${root.toString().trim()}\n`, "utf8");
