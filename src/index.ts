import { catalogHealth } from "./health";
import { normalizePublicPathname } from "./http/publicPath";
import { isCatalogUpdateMessage, type CatalogUpdateMessageV1 } from "./contracts/catalogUpdate";
import { insertCatalogIngestionEvent } from "./storage/catalogIngestionRepository";
import {
  loadPendingIngestionEvent,
  markIngestionProcessingFailure,
  processPendingServiceIdentityBatch,
  processServiceIdentity,
} from "./storage/serviceIdentityRepository";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function handleCatalogRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = normalizePublicPathname(url.pathname);

  if (pathname === "/health") {
    if (request.method !== "GET") {
      return json(
        { status: "method_not_allowed", message: "Método não permitido.", allowed: ["GET"] },
        405,
      );
    }

    return json(catalogHealth(env));
  }

  return json({ status: "not_found", message: "Endpoint inexistente." }, 404);
}

export async function processCatalogUpdate(
  db: D1Database,
  value: unknown,
): Promise<"accepted" | "invalid"> {
  if (!isCatalogUpdateMessage(value)) return "invalid";
  await insertCatalogIngestionEvent(db, value);

  const pending = await loadPendingIngestionEvent(db, value.eventId);
  if (pending) {
    try {
      await processServiceIdentity(db, pending);
    } catch (error) {
      await markIngestionProcessingFailure(db, value.eventId, error);
      throw error;
    }
  }

  return "accepted";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleCatalogRequest(request, env);
  },

  async queue(batch, env): Promise<void> {
    console.log(`[QAgent Catalog] revision=service-identity-v1 messages=${batch.messages.length}`);
    for (const message of batch.messages) {
      try {
        const result = await processCatalogUpdate(env.CATALOG_DB, message.body);
        if (result === "invalid") {
          console.error("[QAgent Catalog] invalid catalog update", message.id);
        }
        message.ack();
      } catch (error) {
        console.error("[QAgent Catalog] catalog ingestion failed", message.id, error);
        message.retry({ delaySeconds: 5 });
      }
    }

    // A bounded sweep also upgrades events that were already PENDING before
    // Foundation 07.5.3 was deployed.
    const sweep = await processPendingServiceIdentityBatch(env.CATALOG_DB, 100);
    if (sweep.processed || sweep.failed) {
      console.log(`[QAgent Catalog] pending sweep processed=${sweep.processed} failed=${sweep.failed}`);
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil((async () => {
      const sweep = await processPendingServiceIdentityBatch(env.CATALOG_DB, 100);
      console.log(`[QAgent Catalog] scheduled service identity sweep processed=${sweep.processed} failed=${sweep.failed}`);
    })());
  },
} satisfies ExportedHandler<Env, unknown, CatalogUpdateMessageV1>;
