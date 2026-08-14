import { readFileSync } from "node:fs";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

const required = [
  ['Catalog D1 binding', /binding\s*=\s*["']CATALOG_DB["']/],
  ['Catalog update Queue consumer', /\[\[queues\.consumers\]\][\s\S]*?queue\s*=\s*["']qagent-catalog-updates-dev["']/],
  ['Service identity recovery cron', /\[triggers\][\s\S]*?crons\s*=\s*\[[^\]]*["']\*\/5 \* \* \* \*["']/],
];

const missing = required.filter(([, pattern]) => !pattern.test(wrangler)).map(([name]) => name);
if (missing.length) {
  console.error(`[QAgent Catalog] Missing required Wrangler configuration: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('[QAgent Catalog] D1, Queue consumer and recovery cron bindings verified.');
