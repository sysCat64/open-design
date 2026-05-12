// Tag derivation contract for the plugins-home filter row. The home
// section ranks plugins by scenario tag rather than the legacy 4
// surface buckets (image / video / examples / design); these tests
// lock the slug surface so a tag never silently drops out of the
// pill row when the manifest schema evolves.

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  buildTagCatalog,
  isFeaturedPlugin,
  labelForTag,
  pluginTags,
} from '../../src/components/plugins-home/scenarioTags';

function fixture(overrides: {
  id: string;
  title?: string;
  tags?: string[];
  od?: Record<string, unknown>;
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      ...(overrides.tags ? { tags: overrides.tags } : {}),
      ...(overrides.od ? { od: overrides.od } : {}),
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('pluginTags', () => {
  it('emits image / image-template / marketing for a wrapped image template', () => {
    const tags = pluginTags(
      fixture({
        id: 'image-template-foo',
        tags: ['image-template', 'first-party', 'image', 'marketing'],
        od: { kind: 'scenario', taskKind: 'new-generation', mode: 'image', surface: 'image' },
      }),
    );
    expect(tags).toContain('image');
    expect(tags).toContain('image-template');
    expect(tags).toContain('marketing');
    expect(tags).toContain('new-generation');
    expect(tags).not.toContain('first-party');
  });

  it('adds a synthetic workflow tag for multi-stage scenario plugins', () => {
    const tags = pluginTags(
      fixture({
        id: 'od-code-migration',
        tags: ['scenario', 'first-party', 'code-migration'],
        od: {
          kind: 'scenario',
          taskKind: 'code-migration',
          pipeline: { stages: [{ id: 'a', atoms: ['x'] }, { id: 'b', atoms: ['y'] }] },
        },
      }),
    );
    expect(tags).toContain('workflow');
    expect(tags).toContain('code-migration');
    expect(tags).not.toContain('scenario');
  });

  it('drops noise tags but keeps surface / scenario / mode', () => {
    const tags = pluginTags(
      fixture({
        id: 'example-saas-landing',
        tags: ['example', 'first-party', 'phase-7'],
        od: { kind: 'scenario', mode: 'prototype', scenario: 'marketing', surface: 'web' },
      }),
    );
    expect(tags).toEqual(expect.arrayContaining(['example', 'marketing', 'prototype', 'web']));
    expect(tags).not.toContain('first-party');
    expect(tags).not.toContain('phase-7');
  });
});

describe('buildTagCatalog', () => {
  it('pins type tags (image / video / design-system) ahead of free-form tags', () => {
    const catalog = buildTagCatalog([
      fixture({ id: 'a', tags: ['marketing'], od: { mode: 'image', surface: 'image' } }),
      fixture({ id: 'b', tags: ['marketing'], od: { mode: 'image', surface: 'image' } }),
      fixture({ id: 'c', tags: ['design-system'], od: { mode: 'design-system', surface: 'web' } }),
    ]);
    const slugs = catalog.map((t) => t.slug);
    // 'image' (pinned, count=2) should come before 'marketing' (count=2).
    expect(slugs.indexOf('image')).toBeLessThan(slugs.indexOf('marketing'));
  });

  it('orders by count desc within the non-pinned section', () => {
    const catalog = buildTagCatalog([
      fixture({ id: 'a', tags: ['marketing'] }),
      fixture({ id: 'b', tags: ['marketing'] }),
      fixture({ id: 'c', tags: ['dashboard'] }),
    ]);
    const slugs = catalog.map((t) => t.slug);
    expect(slugs.indexOf('marketing')).toBeLessThan(slugs.indexOf('dashboard'));
  });
});

describe('isFeaturedPlugin', () => {
  it('returns true when od.featured === true', () => {
    expect(isFeaturedPlugin(fixture({ id: 'a', od: { featured: true } }))).toBe(true);
    expect(isFeaturedPlugin(fixture({ id: 'b', od: { featured: 'true' } }))).toBe(false);
    expect(isFeaturedPlugin(fixture({ id: 'c' }))).toBe(false);
  });
});

describe('labelForTag', () => {
  it('uses the known dictionary for canonical slugs', () => {
    expect(labelForTag('image')).toBe('Image');
    expect(labelForTag('design-system')).toBe('Design system');
  });
  it('falls back to title-casing unknown slugs', () => {
    expect(labelForTag('mocktail-bar')).toBe('Mocktail Bar');
  });
});
