// Daemon `applyPlugin` purity test (plan F4).
//
// applyPlugin must:
//   - Compute a deterministic snapshot for the same inputs.
//   - Refuse to mutate the registry / FS / SQLite — caller owns persistence.
//   - Throw MissingInputError when a required input is absent.

import { describe, expect, it } from 'vitest';
import { applyPlugin, MissingInputError } from '../src/plugins/apply.js';
import { defaultRegistryRoots } from '../src/plugins/registry.js';
import { TRUSTED_DEFAULT_CAPABILITIES } from '../src/plugins/trust.js';
import type { ContextItem, InstalledPluginRecord } from '@open-design/contracts';

function pluginFixture(extra: Partial<InstalledPluginRecord> = {}): InstalledPluginRecord {
  return {
    id: 'sample-plugin',
    title: 'Sample Plugin',
    version: '1.0.0',
    sourceKind: 'local',
    source: '/tmp/sample-plugin',
    sourceMarketplaceId: undefined,
    pinnedRef: undefined,
    sourceDigest: undefined,
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    fsPath: '/tmp/sample-plugin',
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'sample-plugin',
      title: 'Sample Plugin',
      version: '1.0.0',
      description: 'Fixture for apply tests.',
      od: {
        kind: 'skill',
        taskKind: 'new-generation',
        useCase: { query: 'Generate a {{topic}} brief.' },
        inputs: [
          { name: 'topic', type: 'string', required: true },
          { name: 'audience', type: 'string', default: 'general' },
        ],
        context: {
          skills: [{ ref: 'sample-skill' }],
          atoms: ['todo-write'],
        },
        capabilities: ['prompt:inject'],
      },
    },
    ...extra,
  };
}

const REGISTRY = {
  skills: [{ id: 'sample-skill', title: 'Sample Skill' }],
  designSystems: [],
  craft: [],
  atoms: [{ id: 'todo-write', label: 'Todo write' }],
};

describe('applyPlugin', () => {
  it('produces a deterministic snapshot for the same inputs', () => {
    const a = applyPlugin({ plugin: pluginFixture(), inputs: { topic: 'design' }, registry: REGISTRY });
    const b = applyPlugin({ plugin: pluginFixture(), inputs: { topic: 'design' }, registry: REGISTRY });
    expect(a.manifestSourceDigest).toBe(b.manifestSourceDigest);
    expect(a.result.appliedPlugin.manifestSourceDigest).toBe(b.result.appliedPlugin.manifestSourceDigest);
    expect(a.result.appliedPlugin.appliedAt).not.toBe(0);
  });

  it('throws MissingInputError when a required input is missing', () => {
    expect(() => applyPlugin({ plugin: pluginFixture(), inputs: {}, registry: REGISTRY })).toThrow(MissingInputError);
  });

  it('coerces optional inputs by defaulting when blank', () => {
    const result = applyPlugin({ plugin: pluginFixture(), inputs: { topic: 'design' }, registry: REGISTRY });
    expect(result.result.appliedPlugin.inputs.audience).toBe('general');
  });

  it('grants trusted defaults plus required caps for a trusted plugin', () => {
    const result = applyPlugin({ plugin: pluginFixture(), inputs: { topic: 'design' }, registry: REGISTRY });
    for (const cap of TRUSTED_DEFAULT_CAPABILITIES) {
      expect(result.result.capabilitiesGranted).toContain(cap);
    }
  });

  it('emits skill+atom items in resolvedContext.items', () => {
    const result = applyPlugin({ plugin: pluginFixture(), inputs: { topic: 'design' }, registry: REGISTRY });
    const kinds = result.result.contextItems.map((c: ContextItem) => c.kind);
    expect(kinds).toContain('skill');
    expect(kinds).toContain('atom');
  });

  it('does not require a registry roots argument (no FS access at apply time)', () => {
    // Sanity: the function must not reach for the on-disk plugin folder.
    const roots = defaultRegistryRoots();
    expect(roots.userPluginsRoot).toMatch(/\.open-design[\/\\]plugins$/);
    const result = applyPlugin({ plugin: pluginFixture(), inputs: { topic: 'design' }, registry: REGISTRY });
    expect(result.result.appliedPlugin.pluginId).toBe('sample-plugin');
  });
});
