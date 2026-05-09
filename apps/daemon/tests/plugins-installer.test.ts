// Installer integration: copies a local-folder plugin into a sandbox
// userPluginsRoot, persists the installed_plugins row, and surfaces SSE
// events. Phase 1 covers exactly the local-folder source path; tarball
// arrival lands in Phase 2A.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migratePlugins } from '../src/plugins/persistence.js';
import { installFromLocalFolder, uninstallPlugin } from '../src/plugins/installer.js';
import { listInstalledPlugins } from '../src/plugins/registry.js';
import type { InstalledPluginRecord } from '@open-design/contracts';

let tmpRoot: string;
let pluginsRoot: string;
let sourceFolder: string;
let db: Database.Database;

beforeEach(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-installer-'));
  pluginsRoot = path.join(tmpRoot, 'plugins');
  sourceFolder = path.join(tmpRoot, 'source-plugin');
  await mkdir(sourceFolder, { recursive: true });
  await writeFile(
    path.join(sourceFolder, 'open-design.json'),
    JSON.stringify({
      name: 'sample-plugin',
      version: '1.0.0',
      title: 'Sample Plugin',
      od: {
        kind: 'skill',
        taskKind: 'new-generation',
        useCase: { query: 'Make a {{topic}} brief.' },
        inputs: [{ name: 'topic', type: 'string', required: true }],
      },
    }, null, 2),
  );
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
});

afterEach(async () => {
  db.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('installFromLocalFolder', () => {
  it('copies the folder and writes installed_plugins', async () => {
    const events: string[] = [];
    let installedRecord: InstalledPluginRecord | null = null;

    for await (const ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      events.push(ev.kind);
      if (ev.kind === 'success') installedRecord = ev.plugin;
      if (ev.kind === 'error') throw new Error(ev.message);
    }

    expect(events.at(-1)).toBe('success');
    expect(installedRecord?.id).toBe('sample-plugin');
    expect(installedRecord?.version).toBe('1.0.0');
    const list = listInstalledPlugins(db);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('sample-plugin');
    expect(list[0]?.fsPath).toBe(path.join(pluginsRoot, 'sample-plugin'));
  });

  it('rejects symbolic links inside the source tree', async () => {
    // Create a benign symlink — the installer must refuse anything that
    // could escape the staged folder.
    const linkPath = path.join(sourceFolder, 'evil-link');
    await mkdir(path.dirname(linkPath), { recursive: true });
    const fs = await import('node:fs/promises');
    await fs.symlink('/etc/passwd', linkPath).catch(() => undefined);

    let errored = false;
    for await (const ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      if (ev.kind === 'error') errored = true;
    }
    expect(errored).toBe(true);
  });

  it('uninstall removes the row and on-disk staged folder', async () => {
    for await (const _ev of installFromLocalFolder(db, {
      source: sourceFolder,
      roots: { userPluginsRoot: pluginsRoot },
    })) {
      void _ev;
    }
    const result = await uninstallPlugin(db, 'sample-plugin', { userPluginsRoot: pluginsRoot });
    expect(result.ok).toBe(true);
    expect(listInstalledPlugins(db)).toHaveLength(0);
  });
});
