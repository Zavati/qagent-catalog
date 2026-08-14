import { catalogHealth } from "./health";
import { normalizePublicPathname } from "./http/publicPath";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleCatalogRequest(request, env);
  },
};
