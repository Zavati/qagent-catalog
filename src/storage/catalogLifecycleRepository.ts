import {
  CATALOG_LIFECYCLE_VERSION,
  catalogLifecycleEventIdFor,
  planLifecycleTransition,
  type CatalogLifecycleSource,
  type CatalogLifecycleState,
  type EndpointLifecycleSnapshot,
  type LifecycleTransitionRequest,
} from "../lifecycle/catalogLifecycle";

interface LifecycleRow {
  endpoint_id: string;
  lifecycle_state: CatalogLifecycleState;
  lifecycle_source: CatalogLifecycleSource;
  lifecycle_revision: number;
  lifecycle_actor_id: string | null;
  lifecycle_reason: string | null;
  lifecycle_updated_at: string | null;
}

interface LifecycleEventRow {
  lifecycle_event_id: string;
  lifecycle_revision: number;
  to_state: CatalogLifecycleState;
  source: CatalogLifecycleSource;
}

export interface LifecycleTransitionResult {
  changed: boolean;
  idempotentReplay: boolean;
  lifecycleEventId: string | null;
  lifecycle: EndpointLifecycleSnapshot;
}

function toSnapshot(row: LifecycleRow): EndpointLifecycleSnapshot {
  if (!row.lifecycle_updated_at) throw new Error("catalog_lifecycle_missing_updated_at");
  return {
    endpointId: row.endpoint_id,
    state: row.lifecycle_state,
    source: row.lifecycle_source,
    revision: row.lifecycle_revision,
    actorId: row.lifecycle_actor_id,
    reason: row.lifecycle_reason,
    updatedAt: row.lifecycle_updated_at,
  };
}

export async function loadEndpointLifecycle(
  db: D1Database,
  endpointId: string,
): Promise<EndpointLifecycleSnapshot | null> {
  const row = await db.prepare(`
    SELECT
      endpoint_id,
      lifecycle_state,
      lifecycle_source,
      lifecycle_revision,
      lifecycle_actor_id,
      lifecycle_reason,
      lifecycle_updated_at
    FROM catalog_endpoints
    WHERE endpoint_id = ?
    LIMIT 1
  `).bind(endpointId).first<LifecycleRow>();

  return row ? toSnapshot(row) : null;
}

async function findLifecycleEvent(
  db: D1Database,
  lifecycleEventId: string,
): Promise<LifecycleEventRow | null> {
  return db.prepare(`
    SELECT lifecycle_event_id, lifecycle_revision, to_state, source
    FROM catalog_endpoint_lifecycle_events
    WHERE lifecycle_event_id = ?
    LIMIT 1
  `).bind(lifecycleEventId).first<LifecycleEventRow>();
}

export async function transitionEndpointLifecycle(
  db: D1Database,
  endpointId: string,
  request: LifecycleTransitionRequest,
  now = new Date().toISOString(),
): Promise<LifecycleTransitionResult> {
  const current = await loadEndpointLifecycle(db, endpointId);
  if (!current) throw new Error("catalog_lifecycle_endpoint_not_found");

  const actorId = request.actorId?.trim() || null;
  const reason = request.reason?.trim() || null;
  const intendedRevision = request.expectedRevision + 1;
  const intendedEventId = await catalogLifecycleEventIdFor(
    endpointId,
    intendedRevision,
    request.targetState,
    request.source,
    actorId,
    reason,
  );

  // Safe retry: if the same transition already committed, return its current state
  // rather than creating a second audit event.
  if (current.revision !== request.expectedRevision) {
    const prior = await findLifecycleEvent(db, intendedEventId);
    if (
      prior
      && prior.lifecycle_revision === intendedRevision
      && prior.to_state === request.targetState
      && prior.source === request.source
      && current.revision >= intendedRevision
      && current.state === request.targetState
    ) {
      return {
        changed: false,
        idempotentReplay: true,
        lifecycleEventId: intendedEventId,
        lifecycle: current,
      };
    }
    throw new Error("catalog_lifecycle_revision_conflict");
  }

  const plan = planLifecycleTransition(current, request);
  if (!plan.changed) {
    return {
      changed: false,
      idempotentReplay: false,
      lifecycleEventId: null,
      lifecycle: current,
    };
  }

  const lifecycleEventId = await catalogLifecycleEventIdFor(
    endpointId,
    plan.nextRevision,
    plan.toState,
    plan.source,
    plan.actorId,
    plan.reason,
  );

  const auditInsert = db.prepare(`
    INSERT INTO catalog_endpoint_lifecycle_events (
      lifecycle_event_id,
      endpoint_id,
      organization_id,
      project_id,
      service_id,
      lifecycle_revision,
      from_state,
      to_state,
      source,
      actor_id,
      reason,
      changed_at,
      created_at
    )
    SELECT
      ?, endpoint_id, organization_id, project_id, service_id,
      ?, lifecycle_state, ?, ?, ?, ?, ?, ?
    FROM catalog_endpoints
    WHERE endpoint_id = ?
      AND lifecycle_revision = ?
  `).bind(
    lifecycleEventId,
    plan.nextRevision,
    plan.toState,
    plan.source,
    plan.actorId,
    plan.reason,
    now,
    now,
    endpointId,
    plan.currentRevision,
  );

  const endpointUpdate = db.prepare(`
    UPDATE catalog_endpoints
    SET lifecycle_state = ?,
        lifecycle_source = ?,
        lifecycle_version = ?,
        lifecycle_revision = lifecycle_revision + 1,
        lifecycle_actor_id = ?,
        lifecycle_reason = ?,
        lifecycle_updated_at = ?,
        updated_at = ?
    WHERE endpoint_id = ?
      AND lifecycle_revision = ?
  `).bind(
    plan.toState,
    plan.source,
    CATALOG_LIFECYCLE_VERSION,
    plan.actorId,
    plan.reason,
    now,
    now,
    endpointId,
    plan.currentRevision,
  );

  const [, updateResult] = await db.batch([auditInsert, endpointUpdate]);
  if ((updateResult.meta.changes ?? 0) !== 1) {
    throw new Error("catalog_lifecycle_revision_conflict");
  }

  const updated = await loadEndpointLifecycle(db, endpointId);
  if (!updated) throw new Error("catalog_lifecycle_endpoint_not_found_after_update");

  return {
    changed: true,
    idempotentReplay: false,
    lifecycleEventId,
    lifecycle: updated,
  };
}
