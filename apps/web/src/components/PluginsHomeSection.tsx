// Plugins discovery section on Home.
//
// Collapses what used to be four separate tabs (Examples, Image
// templates, Video templates, plus the inline plugins rail) into one
// vertical surface: a category filter pill row and a responsive grid
// of plugin cards.
//
// "Featured" lives as the first pill in the filter row (not a
// separate hero card above it). The Featured pill is selected by
// default whenever the project ships at least one featured plugin
// candidate, so the most relevant card is what users see first.
//
// Featured source — every plugin whose manifest declares
// `od.featured: true`; falls back to the first scenario plugin so
// the slot stays populated even before the user marks anything.

import { useMemo, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { Icon } from './Icon';

export type PluginCategory =
  | 'featured'
  | 'all'
  | 'design'
  | 'image'
  | 'video'
  | 'examples'
  | 'other';

interface Props {
  plugins: InstalledPluginRecord[];
  loading: boolean;
  activePluginId: string | null;
  pendingApplyId: string | null;
  onUse: (record: InstalledPluginRecord) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
}

interface ManifestExtras {
  featured?: boolean;
  surface?: string;
}

function manifestExtras(record: InstalledPluginRecord): ManifestExtras {
  const od = record.manifest?.od ?? {};
  const extras = od as Record<string, unknown>;
  return {
    featured: extras.featured === true,
    surface: typeof extras.surface === 'string' ? (extras.surface as string) : undefined,
  };
}

function categoryFor(record: InstalledPluginRecord): PluginCategory {
  const od = record.manifest?.od ?? {};
  const extras = manifestExtras(record);
  if (
    od.taskKind === 'new-generation' ||
    od.taskKind === 'code-migration' ||
    od.taskKind === 'figma-migration' ||
    od.taskKind === 'tune-collab'
  ) {
    return 'design';
  }
  if (od.kind === 'scenario') return 'design';
  if (extras.surface === 'image' || od.mode === 'image') return 'image';
  if (extras.surface === 'video' || od.mode === 'video') return 'video';
  if (od.kind === 'skill') return 'examples';
  return 'other';
}

function getFeaturedPlugins(plugins: InstalledPluginRecord[]): InstalledPluginRecord[] {
  const explicit = plugins.filter((p) => manifestExtras(p).featured);
  if (explicit.length > 0) return explicit;
  // Fallback: first scenario plugin so the Featured pill stays populated
  // until someone marks one with `od.featured: true`.
  const scenario = plugins.find((p) => p.manifest?.od?.kind === 'scenario');
  return scenario ? [scenario] : [];
}

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  featured: 'Featured',
  all: 'All',
  design: 'Design',
  image: 'Image',
  video: 'Video',
  examples: 'Examples',
  other: 'Other',
};

const CATEGORY_ORDER: PluginCategory[] = [
  'featured',
  'all',
  'design',
  'image',
  'video',
  'examples',
  'other',
];

export function PluginsHomeSection({
  plugins,
  loading,
  activePluginId,
  pendingApplyId,
  onUse,
  onOpenDetails,
}: Props) {
  // `null` means "fall back to the first available category"; the
  // user's explicit choice (or undefined) is tracked in the same
  // state so we can stop snapping back to Featured once they pick
  // something else, while still defaulting to Featured on first
  // mount and any time it becomes available again.
  const [pickedCategory, setPickedCategory] = useState<PluginCategory | null>(null);

  const visiblePlugins = useMemo(() => {
    return plugins.filter((p) => p.manifest?.od?.kind !== 'atom');
  }, [plugins]);

  const featuredList = useMemo(() => getFeaturedPlugins(visiblePlugins), [visiblePlugins]);

  // Featured plugins also appear under their natural category (and
  // under "All"), so the categorized buckets do not exclude them
  // anymore. The "Featured" pill is just an additional, curated
  // filter that surfaces the same records.
  const categorized = useMemo(() => {
    const map = new Map<PluginCategory, InstalledPluginRecord[]>();
    for (const p of visiblePlugins) {
      const cat = categoryFor(p);
      const list = map.get(cat) ?? [];
      list.push(p);
      map.set(cat, list);
    }
    return map;
  }, [visiblePlugins]);

  const counts = useMemo<Record<PluginCategory, number>>(
    () => ({
      featured: featuredList.length,
      all: visiblePlugins.length,
      design: categorized.get('design')?.length ?? 0,
      image: categorized.get('image')?.length ?? 0,
      video: categorized.get('video')?.length ?? 0,
      examples: categorized.get('examples')?.length ?? 0,
      other: categorized.get('other')?.length ?? 0,
    }),
    [visiblePlugins, categorized, featuredList],
  );

  const visibleCategories = useMemo<PluginCategory[]>(() => {
    return CATEGORY_ORDER.filter((c) => {
      if (c === 'featured') return featuredList.length > 0;
      if (c === 'all') return true;
      return counts[c] > 0;
    });
  }, [counts, featuredList.length]);

  // Resolve which pill is active right now: prefer the user's
  // explicit pick, but only when it's still available; otherwise
  // default to Featured (when present) or All. This keeps the
  // Featured pill selected on first paint without an extra effect
  // and avoids the "snap to All while plugins load" flash.
  const category: PluginCategory =
    pickedCategory && visibleCategories.includes(pickedCategory)
      ? pickedCategory
      : (visibleCategories[0] ?? 'all');

  const filtered = useMemo(() => {
    if (category === 'featured') return featuredList;
    if (category === 'all') {
      return CATEGORY_ORDER.flatMap((c) =>
        c === 'featured' || c === 'all' ? [] : (categorized.get(c) ?? []),
      );
    }
    return categorized.get(category) ?? [];
  }, [category, categorized, featuredList]);

  return (
    <section className="plugins-home" data-testid="plugins-home-section">
      <header className="plugins-home__head">
        <h2 className="plugins-home__title">Plugins</h2>
        <span className="plugins-home__count">
          {loading ? '…' : `${visiblePlugins.length} installed`}
        </span>
      </header>

      {loading ? (
        <div className="plugins-home__empty">Loading plugins…</div>
      ) : visiblePlugins.length === 0 ? (
        <div className="plugins-home__empty">
          No plugins installed. Install one with{' '}
          <code>od plugin install &lt;source&gt;</code>.
        </div>
      ) : (
        <>
          {visibleCategories.length > 1 ? (
            <div
              className="plugins-home__filters"
              role="tablist"
              aria-label="Plugin categories"
            >
              {visibleCategories.map((cat) => {
                const isActive = category === cat;
                const isFeatured = cat === 'featured';
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={[
                      'plugins-home__filter',
                      isActive ? 'is-active' : '',
                      isFeatured ? 'plugins-home__filter--featured' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setPickedCategory(cat)}
                    data-testid={`plugins-home-filter-${cat}`}
                  >
                    {isFeatured ? (
                      <Icon
                        name="star"
                        size={11}
                        className="plugins-home__filter-icon"
                      />
                    ) : null}
                    <span>{CATEGORY_LABELS[cat]}</span>
                    <span className="plugins-home__filter-count">{counts[cat]}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="plugins-home__grid" role="list">
            {filtered.map((p) => (
              <PluginCard
                key={p.id}
                record={p}
                isActive={activePluginId === p.id}
                isPending={pendingApplyId === p.id}
                pendingAny={pendingApplyId !== null}
                isFeatured={featuredList.some((f) => f.id === p.id)}
                onUse={onUse}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

interface PluginCardProps {
  record: InstalledPluginRecord;
  isActive: boolean;
  isPending: boolean;
  pendingAny: boolean;
  isFeatured: boolean;
  onUse: (record: InstalledPluginRecord) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
}

function PluginCard({
  record,
  isActive,
  isPending,
  pendingAny,
  isFeatured,
  onUse,
  onOpenDetails,
}: PluginCardProps) {
  const hasQuery = Boolean(record.manifest?.od?.useCase?.query);
  return (
    <article
      role="listitem"
      className={[
        'plugins-home__card',
        isActive ? 'is-active' : '',
        isFeatured ? 'is-featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-plugin-id={record.id}
      {...(isFeatured ? { 'data-featured': 'true' } : {})}
    >
      <header className="plugins-home__card-head">
        <span className="plugins-home__card-title" title={record.title}>
          {isFeatured ? (
            <Icon
              name="star"
              size={11}
              className="plugins-home__card-featured-mark"
            />
          ) : null}
          {record.title}
        </span>
        <span className={`plugins-home__trust trust-${record.trust}`}>
          {record.trust}
        </span>
      </header>
      {record.manifest?.description ? (
        <p className="plugins-home__card-desc">{record.manifest.description}</p>
      ) : null}
      <div className="plugins-home__card-meta">
        {record.manifest?.od?.taskKind ? (
          <span>{record.manifest.od.taskKind}</span>
        ) : null}
        {record.manifest?.od?.kind ? <span>· {record.manifest.od.kind}</span> : null}
      </div>
      <div className="plugins-home__card-actions">
        <button
          type="button"
          className="plugins-home__action plugins-home__action--secondary"
          onClick={() => onOpenDetails(record)}
          aria-label={`View details for ${record.title}`}
          data-testid={`plugins-home-details-${record.id}`}
        >
          <Icon name="eye" size={12} />
          <span>Details</span>
        </button>
        <button
          type="button"
          className="plugins-home__action plugins-home__action--primary"
          onClick={() => onUse(record)}
          disabled={isPending || pendingAny}
          aria-busy={isPending ? 'true' : undefined}
          data-testid={`plugins-home-use-${record.id}`}
        >
          {isPending
            ? 'Applying…'
            : hasQuery
              ? isActive
                ? 'Reload'
                : 'Use'
              : isActive
                ? 'Active'
                : 'Use'}
        </button>
      </div>
    </article>
  );
}
