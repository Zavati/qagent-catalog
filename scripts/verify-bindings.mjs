import { readFileSync } from "node:fs";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

const required = [
  ['Catalog D1 binding', /binding\s*=\s*["']CATALOG_DB["']/],
  ['Catalog update Queue consumer', /\[\[queues\.consumers\]\][\s\S]*?queue\s*=\s*["']qagent-catalog-updates-dev["']/],
  ['Knowledge recovery cron', /\[triggers\][\s\S]*?crons\s*=\s*\[[^\]]*["']\*\/5 \* \* \* \*["']/],
  ['Query auth skew configuration', /CATALOG_QUERY_MAX_SKEW_SECONDS\s*=\s*["']300["']/],
  ['Query HMAC required secret declaration', /\[secrets\][\s\S]*?required\s*=\s*\[[^\]]*["']CATALOG_QUERY_HMAC_SECRET["']/],
  ['Foundation metadata 07.5.11', /FOUNDATION\s*=\s*["']07\.5\.11["']/],
  ['Revision metadata catalog-query-v1', /REVISION\s*=\s*["']catalog-query-v1["']/],
];

const missing = required.filter(([, pattern]) => !pattern.test(wrangler)).map(([name]) => name);
if (missing.length) {
  console.error(`[QAgent Catalog] Missing required Wrangler configuration: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('[QAgent Catalog] D1, Queue consumer, recovery cron and 07.5.11 release metadata and query auth configuration verified.');
