import { createHmac } from "node:crypto";

const [urlArg, organizationId, projectId, methodArg = "GET"] = process.argv.slice(2);
const secret = process.env.CATALOG_QUERY_HMAC_SECRET;

if (!urlArg || !organizationId || !projectId) {
  console.error("Usage: CATALOG_QUERY_HMAC_SECRET=... node scripts/sign-query-request.mjs <url> <organizationId> <projectId> [method]");
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error("CATALOG_QUERY_HMAC_SECRET must be set and contain at least 32 characters.");
  process.exit(1);
}

const url = new URL(urlArg);
const method = methodArg.toUpperCase();
const timestamp = String(Math.floor(Date.now() / 1000));
const query = Array.from(url.searchParams.entries())
  .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  .join("&");
const payload = [
  "qagent.catalog-query.v1",
  method,
  url.pathname,
  query,
  organizationId,
  projectId,
  timestamp,
].join("\n");
const signature = createHmac("sha256", secret).update(payload).digest("hex");

console.log(`X-QAgent-Organization-Id: ${organizationId}`);
console.log(`X-QAgent-Project-Id: ${projectId}`);
console.log(`X-QAgent-Query-Timestamp: ${timestamp}`);
console.log(`X-QAgent-Query-Signature: ${signature}`);
console.log("");
console.log("curl command:");
console.log([
  "curl",
  "-sS",
  `-X ${method}`,
  `-H ${JSON.stringify(`X-QAgent-Organization-Id: ${organizationId}`)}`,
  `-H ${JSON.stringify(`X-QAgent-Project-Id: ${projectId}`)}`,
  `-H ${JSON.stringify(`X-QAgent-Query-Timestamp: ${timestamp}`)}`,
  `-H ${JSON.stringify(`X-QAgent-Query-Signature: ${signature}`)}`,
  JSON.stringify(url.toString()),
].join(" "));
