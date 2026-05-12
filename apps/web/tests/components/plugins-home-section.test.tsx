// @vitest-environment jsdom

// Plugins home section — UI contract.
//
// The section is now driven by `usePluginCategories` (tag-based
// scenario chips) rather than the legacy 4-bucket taxonomy. This
// suite locks in:
//
//   1. Featured pill is selected by default when at least one plugin
//      declares `od.featured: true`.
//   2. Clicking a scenario tag filters the grid to plugins carrying
//      that tag.
//   3. The "More" pill toggles overflow tags into the row when the
//      catalog exceeds the visible limit.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { PluginsHomeSection } from '../../src/components/PluginsHomeSection';

function makePlugin(overrides: {
  id: string;
  title?: string;
  tags?: string[];
  featured?: boolean;
  mode?: string;
  surface?: string;
  scenario?: string;
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
      title: overrides.title ?? overrides.id,
      ...(overrides.tags ? { tags: overrides.tags } : {}),
      od: {
        kind: 'scenario',
        ...(overrides.mode ? { mode: overrides.mode } : {}),
        ...(overrides.surface ? { surface: overrides.surface } : {}),
        ...(overrides.scenario ? { scenario: overrides.scenario } : {}),
        ...(overrides.featured ? { featured: true } : {}),
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PluginsHomeSection (tag-driven)', () => {
  it('defaults to the Featured pill when a plugin declares featured', () => {
    const plugins = [
      makePlugin({ id: 'star', featured: true, mode: 'image', tags: ['image'] }),
      makePlugin({ id: 'b', mode: 'image', tags: ['image'] }),
      makePlugin({ id: 'c', mode: 'video', tags: ['video'] }),
    ];
    render(
      <PluginsHomeSection
        plugins={plugins}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    const featured = screen.getByTestId('plugins-home-filter-featured');
    expect(featured.getAttribute('aria-selected')).toBe('true');
    const grid = screen.getByRole('list');
    const items = within(grid).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]?.getAttribute('data-plugin-id')).toBe('star');
  });

  it('filters by a scenario tag when its pill is clicked', () => {
    const plugins = [
      makePlugin({ id: 'a', mode: 'image', tags: ['image', 'marketing'] }),
      makePlugin({ id: 'b', mode: 'video', tags: ['video', 'marketing'] }),
      makePlugin({ id: 'c', mode: 'prototype', tags: ['prototype', 'dashboard'] }),
    ];
    render(
      <PluginsHomeSection
        plugins={plugins}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('plugins-home-filter-marketing'));
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-plugin-id')).sort()).toEqual(['a', 'b']);
  });

  it('toggles overflow tags into the pill row when "More" is clicked', () => {
    // Build 12 plugins each tagged with a unique slug — sorted
    // alphabetically by the catalog so the last one ('zz-late') is
    // guaranteed to sit in the overflow tail past the default
    // 8-pill visible window.
    const prefixes = ['aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah', 'ai', 'aj', 'ak', 'zz-late'];
    const plugins = prefixes.map((p) =>
      makePlugin({ id: `id-${p}`, tags: [p, 'image'], mode: 'image' }),
    );
    render(
      <PluginsHomeSection
        plugins={plugins}
        loading={false}
        activePluginId={null}
        pendingApplyId={null}
        onUse={() => {}}
        onOpenDetails={() => {}}
      />,
    );
    const more = screen.getByTestId('plugins-home-filter-more');
    expect(more).toBeTruthy();
    expect(screen.queryByTestId('plugins-home-filter-zz-late')).toBeNull();
    fireEvent.click(more);
    expect(screen.getByTestId('plugins-home-filter-zz-late')).toBeTruthy();
  });
});
