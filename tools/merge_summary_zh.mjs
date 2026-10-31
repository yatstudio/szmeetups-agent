// Merge cached Chinese summaries (summary-zh.json) into events.json.
// Usage: node tools/merge_summary_zh.mjs
// For each event: if summary-zh.json has the event id AND the cached hash `h`
// matches the sha1 (first 12 hex chars) of the current English `summary`,
// set summary_zh to the cached translation; otherwise summary_zh = null.
// Prints total / translated count / ids missing a (valid) translation so the
// maintainer Agent knows what to translate next. Scraper rewrites events.json
// daily, so translations must live in summary-zh.json, never in events.json.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export function summaryHash(summary) {
  return createHash("sha1").update(String(summary), "utf8").digest("hex").slice(0, 12);
}

const dataPath = join(root, "events.json");
const cachePath = join(root, "summary-zh.json");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

let translated = 0;
const missing = [];
for (const e of data.events || []) {
  const sum = e.summary ? String(e.summary).trim() : "";
  const entry = cache[e.id];
  if (sum && entry && entry.zh && entry.h === summaryHash(sum)) {
    e.summary_zh = entry.zh;
    translated++;
  } else {
    e.summary_zh = null;
    if (sum) missing.push(e.id);
  }
}
writeFileSync(dataPath, JSON.stringify(data, null, 1) + "\n", "utf8");
console.log(`total: ${data.events.length} / translated: ${translated} / missing: ${missing.length}`);
if (missing.length) console.log(`missing ids: ${missing.join(", ")}`);
