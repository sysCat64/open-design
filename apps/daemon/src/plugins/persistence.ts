// Plugin-system SQLite migrations. Mirrors the Phase 1 subset of spec
// §11.4: installed_plugins, plugin_marketplaces, applied_plugin_snapshots
// (full §11.4 shape including PB2 expires_at), and ALTER TABLE adds for
// projects / conversations to back-reference the applied snapshot. Run
// devloop / genui surface tables land in Phase 2A and are not created
// here yet — adding empty tables now would be future churn.
//
// `runs` lives in-memory in `apps/daemon/src/runs.ts` today, so the
// run-level snapshot link is carried on the in-memory run object plus
// the messages.run_id row instead of a SQL ALTER TABLE.

import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

export function migratePlugins(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS installed_plugins (
      id                   TEXT PRIMARY KEY,
      title                TEXT NOT NULL,
      version              TEXT NOT NULL,
      source_kind          TEXT NOT NULL,
      source               TEXT NOT NULL,
      pinned_ref           TEXT,
      source_digest        TEXT,
      source_marketplace_id TEXT,
      trust                TEXT NOT NULL,
      capabilities_granted TEXT NOT NULL,
      manifest_json        TEXT NOT NULL,
      fs_path              TEXT NOT NULL,
      installed_at         INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_installed_plugins_source_kind
      ON installed_plugins(source_kind);

    CREATE TABLE IF NOT EXISTS plugin_marketplaces (
      id            TEXT PRIMARY KEY,
      url           TEXT NOT NULL,
      trust         TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      added_at      INTEGER NOT NULL,
      refreshed_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applied_plugin_snapshots (
      id                       TEXT PRIMARY KEY,
      project_id               TEXT NOT NULL,
      conversation_id          TEXT,
      run_id                   TEXT,
      plugin_id                TEXT NOT NULL,
      plugin_version           TEXT NOT NULL,
      manifest_source_digest   TEXT NOT NULL,
      source_marketplace_id    TEXT,
      pinned_ref               TEXT,
      task_kind                TEXT NOT NULL,
      inputs_json              TEXT NOT NULL,
      resolved_context_json    TEXT NOT NULL,
      pipeline_json            TEXT,
      genui_surfaces_json      TEXT NOT NULL DEFAULT '[]',
      capabilities_granted     TEXT NOT NULL,
      capabilities_required    TEXT NOT NULL DEFAULT '[]',
      assets_staged_json       TEXT NOT NULL,
      connectors_required_json TEXT NOT NULL DEFAULT '[]',
      connectors_resolved_json TEXT NOT NULL DEFAULT '[]',
      mcp_servers_json         TEXT NOT NULL DEFAULT '[]',
      plugin_title             TEXT,
      plugin_description       TEXT,
      query_text               TEXT,
      status                   TEXT NOT NULL DEFAULT 'fresh',
      applied_at               INTEGER NOT NULL,
      expires_at               INTEGER,
      FOREIGN KEY (project_id)      REFERENCES projects(id)      ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_project ON applied_plugin_snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_run     ON applied_plugin_snapshots(run_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_plugin  ON applied_plugin_snapshots(plugin_id, plugin_version);
  `);

  // Back-reference columns. SQLite has no IF NOT EXISTS for ALTER; check
  // pragma_table_info first. Mirrors the upstream pattern in db.ts.
  const projectCols = db.prepare(`PRAGMA table_info(projects)`).all() as DbRow[];
  if (!projectCols.some((c) => c['name'] === 'applied_plugin_snapshot_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN applied_plugin_snapshot_id TEXT`);
  }
  const conversationCols = db.prepare(`PRAGMA table_info(conversations)`).all() as DbRow[];
  if (!conversationCols.some((c) => c['name'] === 'applied_plugin_snapshot_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN applied_plugin_snapshot_id TEXT`);
  }
}
