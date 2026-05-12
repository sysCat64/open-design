// Pure categorisation hook for the Plugins home section.
//
// Encapsulates the "what tags exist, who's featured, which subset is
// active" computation so the section component can stay focused on
// rendering. Returning derived state from one place also makes the
// behaviour straightforward to unit-test (see
// tests/components/plugins-home-categories.test.ts).

import { useMemo, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { buildTagCatalog, isFeaturedPlugin, pluginTags, type ScenarioTag } from './scenarioTags';

// Synthetic filter keys for the always-present pills at the start of
// the row. Real tag slugs follow these in the pill array; the union
// type below lets the component compare-and-render with one variable.
export type PluginFilterKey = 'featured' | 'all' | string;

// How many scenario tags we show as standalone pills before collapsing
// the remainder into a "More" expansion. Sized so the row stays on
// one line for typical (~6 type tags + a handful of scenario tags)
// catalogs while leaving an obvious overflow signal when the catalog
// grows past it.
const DEFAULT_VISIBLE_TAGS = 8;

interface UsePluginCategoriesArgs {
  plugins: InstalledPluginRecord[];
  visibleTagLimit?: number;
}

export interface UsePluginCategoriesResult {
  visiblePlugins: InstalledPluginRecord[];
  featuredList: InstalledPluginRecord[];
  filtered: InstalledPluginRecord[];
  filter: PluginFilterKey;
  setFilter: (next: PluginFilterKey | null) => void;
  visibleTags: ScenarioTag[];
  overflowTags: ScenarioTag[];
  showOverflow: boolean;
  toggleOverflow: () => void;
  totalVisible: number;
}

export function usePluginCategories(
  args: UsePluginCategoriesArgs,
): UsePluginCategoriesResult {
  const [picked, setPicked] = useState<PluginFilterKey | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const limit = args.visibleTagLimit ?? DEFAULT_VISIBLE_TAGS;

  // Atoms are infrastructure pieces (`code-import`, `patch-edit`) that
  // are not user-facing on the home grid; the original section already
  // filtered them out and we preserve that contract.
  const visiblePlugins = useMemo(
    () => args.plugins.filter((p) => p.manifest?.od?.kind !== 'atom'),
    [args.plugins],
  );

  const featuredList = useMemo(() => {
    const explicit = visiblePlugins.filter(isFeaturedPlugin);
    if (explicit.length > 0) return explicit;
    const scenario = visiblePlugins.find((p) => p.manifest?.od?.kind === 'scenario');
    return scenario ? [scenario] : [];
  }, [visiblePlugins]);

  const tagCatalog = useMemo(() => buildTagCatalog(visiblePlugins), [visiblePlugins]);
  const visibleTags = useMemo(() => tagCatalog.slice(0, limit), [tagCatalog, limit]);
  const overflowTags = useMemo(() => tagCatalog.slice(limit), [tagCatalog, limit]);

  // Default to Featured (if any), else "All". The user's explicit
  // pick wins as long as it still exists in the catalog after a data
  // refresh — picking a slug that vanished simply snaps back to the
  // default rather than rendering an empty grid.
  const availableFilterKeys = useMemo(() => {
    const keys = new Set<PluginFilterKey>(['all']);
    if (featuredList.length > 0) keys.add('featured');
    for (const tag of tagCatalog) keys.add(tag.slug);
    return keys;
  }, [tagCatalog, featuredList.length]);

  const filter: PluginFilterKey =
    picked && availableFilterKeys.has(picked)
      ? picked
      : featuredList.length > 0
        ? 'featured'
        : 'all';

  const filtered = useMemo(() => {
    if (filter === 'featured') return featuredList;
    if (filter === 'all') return visiblePlugins;
    return visiblePlugins.filter((p) => pluginTags(p).includes(filter));
  }, [filter, featuredList, visiblePlugins]);

  function setFilter(next: PluginFilterKey | null): void {
    setPicked(next);
  }
  function toggleOverflow(): void {
    setShowOverflow((v) => !v);
  }

  return {
    visiblePlugins,
    featuredList,
    filtered,
    filter,
    setFilter,
    visibleTags,
    overflowTags,
    showOverflow,
    toggleOverflow,
    totalVisible: visiblePlugins.length,
  };
}
