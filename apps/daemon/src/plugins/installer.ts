// Plugin installer. Phase 1 supports only the local-folder install path so
// the e2e-1 / §12.5 walkthrough lands without GitHub/HTTPS network code.
// Phase 2A adds the github tarball + https archive sources from spec §7.2.
//
// Hard install constraints (spec §7.2 / plan Phase 1 deliverables):
//   - Reject path-traversal segments inside the source folder when copying.
//   - Reject symlinks (we do not stage non-local pointers).
//   - Cap copied tree size at 50 MiB by default.
//   - Refuse to overwrite a different plugin id at the destination.

import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import {
  defaultRegistryRoots,
  deleteInstalledPlugin,
  resolvePluginFolder,
  upsertInstalledPlugin,
  type RegistryRoots,
} from './registry.js';
import type { InstalledPluginRecord, PluginSourceKind } from '@open-design/contracts';
import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

export interface InstallProgressEvent {
  kind: 'progress';
  phase: 'resolving' | 'copying' | 'parsing' | 'persisting';
  message: string;
}

export interface InstallSuccessEvent {
  kind: 'success';
  plugin: InstalledPluginRecord;
  warnings: string[];
}

export interface InstallErrorEvent {
  kind: 'error';
  message: string;
  warnings: string[];
}

export type InstallEvent = InstallProgressEvent | InstallSuccessEvent | InstallErrorEvent;

export interface InstallOptions {
  source: string;
  // Forwarded via env override or CLI flag; defaults to defaultRegistryRoots()
  // so daemon tests can point at a sandboxed home.
  roots?: RegistryRoots;
  // 50 MiB default mirrors spec §7.2; tests pin a tighter cap.
  maxBytes?: number;
  // When true (the default), an existing install with the same id is
  // replaced. Set false from CLI flows that want to surface a confirm step.
  overwriteExisting?: boolean;
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

const SAFE_BASENAME = /^[a-z0-9][a-z0-9._-]*$/;

export async function* installFromLocalFolder(
  db: SqliteDb,
  opts: InstallOptions,
): AsyncGenerator<InstallEvent, void, void> {
  const warnings: string[] = [];
  const roots = opts.roots ?? defaultRegistryRoots();
  const sourceAbs = path.resolve(opts.source);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  yield { kind: 'progress', phase: 'resolving', message: `Resolving ${sourceAbs}` };

  let stats: fs.Stats;
  try {
    stats = await fsp.stat(sourceAbs);
  } catch (err) {
    yield { kind: 'error', message: `Source folder not found: ${sourceAbs} (${(err as Error).message})`, warnings };
    return;
  }
  if (!stats.isDirectory()) {
    yield { kind: 'error', message: `Source path is not a directory: ${sourceAbs}`, warnings };
    return;
  }

  // Probe the source manifest first so the destination folder name is
  // chosen by manifest id, not by directory name. This keeps registry
  // ids deterministic when authors rename the folder on disk between
  // installs.
  yield { kind: 'progress', phase: 'parsing', message: 'Parsing manifest' };
  const tentativeId = path.basename(sourceAbs).toLowerCase();
  const probe = await resolvePluginFolder({
    folder: sourceAbs,
    folderId: SAFE_BASENAME.test(tentativeId) ? tentativeId : 'plugin',
    sourceKind: 'local',
    source: sourceAbs,
  });
  if (!probe.ok) {
    yield { kind: 'error', message: probe.errors.join('; '), warnings: probe.warnings };
    return;
  }
  warnings.push(...probe.warnings);
  const pluginId = probe.record.id;
  if (!SAFE_BASENAME.test(pluginId)) {
    yield { kind: 'error', message: `Plugin id '${pluginId}' is not a safe folder name`, warnings };
    return;
  }
  const destFolder = path.join(roots.userPluginsRoot, pluginId);

  // Block overwriting a foreign plugin id. The destination folder may
  // contain a previous version of the same id, in which case we replace it.
  if (fs.existsSync(destFolder) && (opts.overwriteExisting ?? true) === false) {
    yield { kind: 'error', message: `Destination folder already exists: ${destFolder}. Pass overwriteExisting=true to replace.`, warnings };
    return;
  }

  yield { kind: 'progress', phase: 'copying', message: `Copying to ${destFolder}` };
  await fsp.mkdir(roots.userPluginsRoot, { recursive: true });
  if (fs.existsSync(destFolder)) {
    await fsp.rm(destFolder, { recursive: true, force: true });
  }
  try {
    await safeCopyTree(sourceAbs, destFolder, maxBytes);
  } catch (err) {
    yield { kind: 'error', message: `Copy failed: ${(err as Error).message}`, warnings };
    await fsp.rm(destFolder, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  yield { kind: 'progress', phase: 'parsing', message: 'Re-parsing destination' };
  const parsed = await resolvePluginFolder({
    folder: destFolder,
    folderId: pluginId,
    sourceKind: 'local',
    source: sourceAbs,
  });
  if (!parsed.ok) {
    await fsp.rm(destFolder, { recursive: true, force: true }).catch(() => undefined);
    yield { kind: 'error', message: parsed.errors.join('; '), warnings: [...warnings, ...parsed.warnings] };
    return;
  }
  warnings.push(...parsed.warnings);

  yield { kind: 'progress', phase: 'persisting', message: 'Writing installed_plugins row' };
  upsertInstalledPlugin(db, parsed.record);

  yield { kind: 'success', plugin: parsed.record, warnings };
}

export interface UninstallResult {
  ok: boolean;
  removedFolder?: string;
  warning?: string;
}

export async function uninstallPlugin(
  db: SqliteDb,
  id: string,
  roots: RegistryRoots = defaultRegistryRoots(),
): Promise<UninstallResult> {
  const removed = deleteInstalledPlugin(db, id);
  const folder = path.join(roots.userPluginsRoot, id);
  let removedFolder: string | undefined;
  try {
    await fsp.rm(folder, { recursive: true, force: true });
    if (fs.existsSync(folder)) {
      // Some platforms refuse to remove read-only files; surface a hint
      // instead of silently leaving stale on-disk state.
      return { ok: removed, warning: `Folder ${folder} could not be removed` };
    }
    removedFolder = folder;
  } catch (err) {
    return { ok: removed, warning: `Folder ${folder} removal failed: ${(err as Error).message}` };
  }
  return { ok: removed || removedFolder !== undefined, removedFolder };
}

// Recursive copy with budget tracking. Symlinks anywhere in the tree fail
// the copy outright; we never reach upstream paths through a clever link.
async function safeCopyTree(src: string, dest: string, maxBytes: number): Promise<void> {
  let bytesCopied = 0;
  const queue: Array<{ src: string; dest: string }> = [{ src, dest }];
  while (queue.length > 0) {
    const { src: from, dest: to } = queue.pop()!;
    const stat = await fsp.lstat(from);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link rejected: ${from}`);
    }
    if (stat.isDirectory()) {
      await fsp.mkdir(to, { recursive: true });
      const entries = await fsp.readdir(from, { withFileTypes: true });
      for (const entry of entries) {
        if (!isSafeBasename(entry.name)) {
          throw new Error(`Unsafe path segment: ${entry.name}`);
        }
        queue.push({ src: path.join(from, entry.name), dest: path.join(to, entry.name) });
      }
      continue;
    }
    if (stat.isFile()) {
      bytesCopied += stat.size;
      if (bytesCopied > maxBytes) {
        throw new Error(`Plugin tree exceeds size cap of ${maxBytes} bytes`);
      }
      await fsp.copyFile(from, to);
      continue;
    }
    // Sockets / fifos / devices — refuse.
    throw new Error(`Unsupported file type at ${from}`);
  }
}

function isSafeBasename(name: string): boolean {
  if (name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  return true;
}

export type { PluginSourceKind };
