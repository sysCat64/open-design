// Phase 4 / spec §11.5 / plan §3.II1 — plugin event ring buffer.
//
// In-memory FIFO ring buffer of plugin lifecycle events
// (install / uninstall / upgrade / apply / snapshot-prune).
// Capped at MAX_BUFFER entries to keep daemon memory bounded
// even on a long-running install spree. Older entries fall off
// the head when the buffer is full.
//
// The buffer is read-only from outside this module. Producers
// (installer / uninstaller / apply path) call `recordPluginEvent()`;
// consumers subscribe via `subscribe()` (returns an unsubscribe
// callback) or pull `snapshot()` for a one-shot read. The route
// in server.ts wires both into a single SSE endpoint.
//
// No SQLite, no FS — pure in-memory state. A daemon restart
// resets the buffer (events survive the run, not the restart).

export type PluginEventKind =
  | 'plugin.installed'
  | 'plugin.upgraded'
  | 'plugin.uninstalled'
  | 'plugin.trust-changed'
  | 'plugin.applied'
  | 'plugin.snapshot-pruned'
  | 'plugin.marketplace-refreshed';

export interface PluginEvent {
  // Unique-per-buffer monotonically-increasing id. Resets on
  // daemon restart. Lets a CLI consumer ask 'what's new since
  // event #N?' without re-reading the whole buffer.
  id:        number;
  kind:      PluginEventKind;
  // Epoch ms.
  at:        number;
  // The plugin id this event relates to. Some events
  // (marketplace-refreshed) have no plugin id; they pass
  // pluginId='' so consumers can filter consistently.
  pluginId:  string;
  // Optional structured payload — installer ships
  // { source, version }, uninstaller ships { reason }, etc.
  details?:  Record<string, unknown>;
}

const MAX_BUFFER = 1000;

interface Subscriber {
  (event: PluginEvent): void;
}

class PluginEventBuffer {
  private buffer: PluginEvent[] = [];
  private subscribers = new Set<Subscriber>();
  private nextId = 1;

  record(input: Omit<PluginEvent, 'id' | 'at'>): PluginEvent {
    const event: PluginEvent = {
      id:       this.nextId++,
      at:       Date.now(),
      kind:     input.kind,
      pluginId: input.pluginId,
      ...(input.details ? { details: input.details } : {}),
    };
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_BUFFER);
    }
    // Fan out to subscribers; exceptions are swallowed so a
    // misbehaving listener can't poison the buffer.
    for (const sub of this.subscribers) {
      try { sub(event); } catch { /* ignore */ }
    }
    return event;
  }

  // Returns a copy of the current buffer slice (since `since`
  // exclusive). Pass since=0 (or omit) for the whole buffer.
  snapshot(since = 0): PluginEvent[] {
    if (since <= 0) return this.buffer.slice();
    return this.buffer.filter((e) => e.id > since);
  }

  // Subscribe to live events. Returns an unsubscribe callback.
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  // Test-only reset. Production callers never invoke this.
  reset(): void {
    this.buffer = [];
    this.subscribers.clear();
    this.nextId = 1;
  }

  size(): number { return this.buffer.length; }
}

const singleton = new PluginEventBuffer();

export function recordPluginEvent(input: Omit<PluginEvent, 'id' | 'at'>): PluginEvent {
  return singleton.record(input);
}

export function pluginEventSnapshot(since?: number): PluginEvent[] {
  return singleton.snapshot(since);
}

export function subscribePluginEvents(fn: Subscriber): () => void {
  return singleton.subscribe(fn);
}

export function pluginEventBufferSize(): number {
  return singleton.size();
}

// Test-only helper for vitest (the production path never calls
// this). Exported so vitest can clear state between cases.
export function __resetPluginEventBufferForTests(): void {
  singleton.reset();
}
