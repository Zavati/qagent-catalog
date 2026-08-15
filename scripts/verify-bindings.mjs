import { readFileSync } from "node:fs";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

const required = [
  ['Catalog D1 binding', /binding\s*=\s*["']CATALOG_DB["']/],
  ['Catalog update Queue consumer', /\[\[queues\.consumers\]\][\s\S]*?queue\s*=\s*["']qagent-catalog-updates-dev["']/],
  ['Knowledge recovery cron', /\[triggers\][\s\S]*?crons\s*=\s*\[[^\]]*["']\*\/5 \* \* \* \*["']/],
  ['Foundation metadata 07.5.9', /FOUNDATION\s*=\s*["']07\.5\.9["']/],
  ['Revision metadata discovery-confidence-v1', /REVISION\s*=\s*["']discovery-confidence-v1["']/],
];

const missing = required.filter(([, pattern]) => !pattern.test(wrangler)).map(([name]) => name);
if (missing.length) {
  console.error(`[QAgent Catalog] Missing required Wrangler configuration: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('[QAgent Catalog] D1, Queue consumer, recovery cron and 07.5.9 release metadata verified.');
