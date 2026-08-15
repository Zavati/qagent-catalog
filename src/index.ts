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
import {
  loadPendingEndpointIdentityEvent,
  markEndpointIdentityFailure,
  processLogicalEndpointIdentity,
  processPendingEndpointIdentityBatch,
} from "./storage/endpointIdentityRepository";

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

  const pendingService = await loadPendingIngestionEvent(db, value.eventId);
  if (pendingService) {
    try {
      await processServiceIdentity(db, pendingService);
    } catch (error) {
      await markIngestionProcessingFailure(db, value.eventId, error);
      throw error;
    }
  }

  const pendingEndpoint = await loadPendingEndpointIdentityEvent(db, value.eventId);
  if (pendingEndpoint) {
    try {
      await processLogicalEndpointIdentity(db, pendingEndpoint);
    } catch (error) {
      await markEndpointIdentityFailure(db, value.eventId, error);
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
    console.log(`[QAgent Catalog] revision=logical-endpoint-identity-v1 messages=${batch.messages.length}`);
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
    const serviceSweep = await processPendingServiceIdentityBatch(env.CATALOG_DB, 100);
    const endpointSweep = await processPendingEndpointIdentityBatch(env.CATALOG_DB, 100);
    if (serviceSweep.processed || serviceSweep.failed || endpointSweep.processed || endpointSweep.failed) {
      console.log(
        `[QAgent Catalog] pending sweep services=${serviceSweep.processed}/${serviceSweep.failed} endpoints=${endpointSweep.processed}/${endpointSweep.failed}`,
      );
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil((async () => {
      const serviceSweep = await processPendingServiceIdentityBatch(env.CATALOG_DB, 100);
      const endpointSweep = await processPendingEndpointIdentityBatch(env.CATALOG_DB, 100);
      console.log(
        `[QAgent Catalog] scheduled knowledge sweep services=${serviceSweep.processed}/${serviceSweep.failed} endpoints=${endpointSweep.processed}/${endpointSweep.failed}`,
      );
    })());
  },
} satisfies ExportedHandler<Env, unknown, CatalogUpdateMessageV1>;
