// Snapshot writer. Spec §8.2.1 demands this be the only module that issues
// INSERT/UPDATE against `applied_plugin_snapshots`. Plan §2 names a CI guard
// for the rule; the apply pipeline must never touch the table directly.
//
// Phase 1 ships:
//   - createSnapshot()  — INSERT a fresh row, stamping expires_at via the
//     PB2 unreferenced TTL knob.
//   - getSnapshot()     — read by id.
//   - linkSnapshotToRun() — once a run starts off the snapshot, pin
//     expires_at = NULL and update run_id (the snapshot is now referenced).
//   - markSnapshotStale() — `od plugin doctor` flips status='stale' after a
//     plugin upgrade. We never rewrite the resolved_context_json, so historic
//     reproducibility wins over freshness.

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { readPluginEnvKnobs } from '../app-config.js';
import type {
  AppliedPluginSnapshot,
  GenUISurfaceSpec,
  McpServerSpec,
  PluginAssetRef,
  PluginConnectorBinding,
  PluginConnectorRef,
  PluginPipeline,
  ResolvedContext,
} from '@open-design/contracts';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

export interface CreateSnapshotInput {
  projectId: string;
  conversationId?: string | null | undefined;
  runId?: string | null | undefined;
  pluginId: string;
  pluginVersion: string;
  pluginTitle?: string | undefined;
  pluginDescription?: string | undefined;
  manifestSourceDigest: string;
  sourceMarketplaceId?: string | null | undefined;
  pinnedRef?: string | null | undefined;
  taskKind: AppliedPluginSnapshot['taskKind'];
  inputs: Record<string, string | number | boolean>;
  resolvedContext: ResolvedContext;
  pipeline?: PluginPipeline | undefined;
  genuiSurfaces?: GenUISurfaceSpec[] | undefined;
  capabilitiesGranted: string[];
  capabilitiesRequired: string[];
  assetsStaged: PluginAssetRef[];
  connectorsRequired: PluginConnectorRef[];
  connectorsResolved: PluginConnectorBinding[];
  mcpServers: McpServerSpec[];
  query?: string | undefined;
}

export function createSnapshot(db: SqliteDb, input: CreateSnapshotInput): AppliedPluginSnapshot {
  const id = randomUUID();
  const now = Date.now();
  const knobs = readPluginEnvKnobs();
  // Per PB2: when a snapshot is created without an associated run, stamp an
  // expiry; when a run is already linked, the snapshot is referenced and the
  // GC worker never touches it.
  const expiresAt = input.runId
    ? null
    : knobs.snapshotUnreferencedTtlDays > 0
      ? now + knobs.snapshotUnreferencedTtlDays * 24 * 60 * 60 * 1000
      : null;

  db.prepare(`
    INSERT INTO applied_plugin_snapshots (
      id, project_id, conversation_id, run_id, plugin_id, plugin_version,
      manifest_source_digest, source_marketplace_id, pinned_ref, task_kind,
      inputs_json, resolved_context_json, pipeline_json, genui_surfaces_json,
      capabilities_granted, capabilities_required, assets_staged_json,
      connectors_required_json, connectors_resolved_json, mcp_servers_json,
      plugin_title, plugin_description, query_text,
      status, applied_at, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fresh', ?, ?)
  `).run(
    id,
    input.projectId,
    input.conversationId ?? null,
    input.runId ?? null,
    input.pluginId,
    input.pluginVersion,
    input.manifestSourceDigest,
    input.sourceMarketplaceId ?? null,
    input.pinnedRef ?? null,
    input.taskKind,
    JSON.stringify(input.inputs),
    JSON.stringify(input.resolvedContext),
    input.pipeline ? JSON.stringify(input.pipeline) : null,
    JSON.stringify(input.genuiSurfaces ?? []),
    JSON.stringify(input.capabilitiesGranted),
    JSON.stringify(input.capabilitiesRequired),
    JSON.stringify(input.assetsStaged),
    JSON.stringify(input.connectorsRequired),
    JSON.stringify(input.connectorsResolved),
    JSON.stringify(input.mcpServers),
    input.pluginTitle ?? null,
    input.pluginDescription ?? null,
    input.query ?? null,
    now,
    expiresAt,
  );

  const snapshot: AppliedPluginSnapshot = buildSnapshot({
    id,
    appliedAt: now,
    input,
    status: 'fresh',
  });
  return snapshot;
}

export function getSnapshot(db: SqliteDb, snapshotId: string): AppliedPluginSnapshot | null {
  const row = db.prepare(`SELECT * FROM applied_plugin_snapshots WHERE id = ?`).get(snapshotId) as DbRow | undefined;
  if (!row) return null;
  return rowToSnapshot(row);
}

export function listSnapshotsForProject(db: SqliteDb, projectId: string): AppliedPluginSnapshot[] {
  const rows = db
    .prepare(`SELECT * FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC`)
    .all(projectId) as DbRow[];
  return rows.map(rowToSnapshot);
}

export function linkSnapshotToRun(db: SqliteDb, snapshotId: string, runId: string): void {
  db.prepare(`
    UPDATE applied_plugin_snapshots
       SET run_id = ?, expires_at = NULL
     WHERE id = ?
  `).run(runId, snapshotId);
}

export function markSnapshotStale(db: SqliteDb, snapshotId: string): void {
  db.prepare(`UPDATE applied_plugin_snapshots SET status = 'stale' WHERE id = ?`).run(snapshotId);
}

export function countSnapshotsForProject(db: SqliteDb, projectId: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM applied_plugin_snapshots WHERE project_id = ?`).get(projectId) as DbRow;
  return Number(row['n'] ?? 0);
}

function buildSnapshot(args: {
  id: string;
  appliedAt: number;
  input: CreateSnapshotInput;
  status: AppliedPluginSnapshot['status'];
}): AppliedPluginSnapshot {
  const { id, appliedAt, input, status } = args;
  const snapshot: AppliedPluginSnapshot = {
    snapshotId:           id,
    pluginId:             input.pluginId,
    pluginVersion:        input.pluginVersion,
    manifestSourceDigest: input.manifestSourceDigest,
    sourceMarketplaceId:  input.sourceMarketplaceId ?? undefined,
    pinnedRef:            input.pinnedRef ?? undefined,
    inputs:               input.inputs,
    resolvedContext:      input.resolvedContext,
    capabilitiesGranted:  input.capabilitiesGranted,
    capabilitiesRequired: input.capabilitiesRequired,
    assetsStaged:         input.assetsStaged,
    taskKind:             input.taskKind,
    appliedAt,
    connectorsRequired:   input.connectorsRequired,
    connectorsResolved:   input.connectorsResolved,
    mcpServers:           input.mcpServers,
    pipeline:             input.pipeline,
    genuiSurfaces:        input.genuiSurfaces,
    pluginTitle:          input.pluginTitle,
    pluginDescription:    input.pluginDescription,
    query:                input.query,
    status,
  };
  return snapshot;
}

export function rowToSnapshot(row: DbRow): AppliedPluginSnapshot {
  const pipeline = parseJsonOrUndefined<PluginPipeline>(row['pipeline_json']);
  const snapshot: AppliedPluginSnapshot = {
    snapshotId:           String(row['id']),
    pluginId:             String(row['plugin_id']),
    pluginVersion:        String(row['plugin_version']),
    manifestSourceDigest: String(row['manifest_source_digest']),
    sourceMarketplaceId:  row['source_marketplace_id'] != null ? String(row['source_marketplace_id']) : undefined,
    pinnedRef:            row['pinned_ref'] != null ? String(row['pinned_ref']) : undefined,
    inputs:               parseJsonOr<Record<string, string | number | boolean>>(row['inputs_json'], {}),
    resolvedContext:      parseJsonOr<ResolvedContext>(row['resolved_context_json'], { items: [] }),
    capabilitiesGranted:  parseJsonOr<string[]>(row['capabilities_granted'], []),
    capabilitiesRequired: parseJsonOr<string[]>(row['capabilities_required'], []),
    assetsStaged:         parseJsonOr<PluginAssetRef[]>(row['assets_staged_json'], []),
    taskKind:             row['task_kind'] as AppliedPluginSnapshot['taskKind'],
    appliedAt:            Number(row['applied_at']),
    connectorsRequired:   parseJsonOr<PluginConnectorRef[]>(row['connectors_required_json'], []),
    connectorsResolved:   parseJsonOr<PluginConnectorBinding[]>(row['connectors_resolved_json'], []),
    mcpServers:           parseJsonOr<McpServerSpec[]>(row['mcp_servers_json'], []),
    pipeline,
    genuiSurfaces:        parseJsonOr<GenUISurfaceSpec[]>(row['genui_surfaces_json'], []),
    pluginTitle:          row['plugin_title'] != null ? String(row['plugin_title']) : undefined,
    pluginDescription:    row['plugin_description'] != null ? String(row['plugin_description']) : undefined,
    query:                row['query_text'] != null ? String(row['query_text']) : undefined,
    status:               row['status'] === 'stale' ? 'stale' : 'fresh',
  };
  return snapshot;
}

function parseJsonOr<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseJsonOrUndefined<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
