export interface CatalogHealthPayload {
  status: "ok";
  service: string;
  foundation: string;
  revision: string;
  role: "knowledge-layer";
  environment: string;
}

export function catalogHealth(env: Env): CatalogHealthPayload {
  return {
    status: "ok",
    service: env.SERVICE_NAME,
    foundation: env.FOUNDATION,
    revision: env.REVISION,
    role: "knowledge-layer",
    environment: env.ENVIRONMENT,
  };
}
