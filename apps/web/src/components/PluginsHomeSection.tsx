// Plugins discovery section on Home.
//
// Renders a single horizontal pill row driven by *plugin tags* rather
// than a hard-coded "Image / Video / Examples / Other" taxonomy. Each
// plugin's `od.scenario / od.mode / od.surface / od.taskKind / tags`
// fields feed `pluginTags()` (`./plugins-home/scenarioTags.ts`), which
// produces normalised slugs; the section ranks them by count and
// surfaces the top N as filter pills with a "More" overflow expansion.
//
// "Featured" lives at the front of the row when at least one plugin
// declares `od.featured: true` (otherwise the first scenario plugin
// stands in so the slot stays populated). It is selected by default.
//
// Categorisation, featured-derivation and filtering are factored out
// to `./plugins-home/usePluginCategories.ts` so this file can stay
// focused on layout and so unit tests can drive the hook in isolation.

import type { InstalledPluginRecord } from '@open-design/contracts';
import { Icon } from './Icon';
import { PluginCard } from './plugins-home/PluginCard';
import {
  usePluginCategories,
  type PluginFilterKey,
} from './plugins-home/usePluginCategories';
import type { ScenarioTag } from './plugins-home/scenarioTags';

interface Props {
  plugins: InstalledPluginRecord[];
  loading: boolean;
  activePluginId: string | null;
  pendingApplyId: string | null;
  onUse: (record: InstalledPluginRecord) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
}

export function PluginsHomeSection({
  plugins,
  loading,
  activePluginId,
  pendingApplyId,
  onUse,
  onOpenDetails,
}: Props) {
  const {
    visiblePlugins,
    featuredList,
    filtered,
    filter,
    setFilter,
    visibleTags,
    overflowTags,
    showOverflow,
    toggleOverflow,
    totalVisible,
  } = usePluginCategories({ plugins });

  return (
    <section className="plugins-home" data-testid="plugins-home-section">
      <header className="plugins-home__head">
        <h2 className="plugins-home__title">Plugins</h2>
        <span className="plugins-home__count">
          {loading ? '…' : `${totalVisible} installed`}
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
          <FilterRow
            filter={filter}
            featuredCount={featuredList.length}
            totalVisible={totalVisible}
            visibleTags={visibleTags}
            overflowTags={overflowTags}
            showOverflow={showOverflow}
            onPick={setFilter}
            onToggleOverflow={toggleOverflow}
          />

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

interface FilterRowProps {
  filter: PluginFilterKey;
  featuredCount: number;
  totalVisible: number;
  visibleTags: ScenarioTag[];
  overflowTags: ScenarioTag[];
  showOverflow: boolean;
  onPick: (key: PluginFilterKey) => void;
  onToggleOverflow: () => void;
}

function FilterRow({
  filter,
  featuredCount,
  totalVisible,
  visibleTags,
  overflowTags,
  showOverflow,
  onPick,
  onToggleOverflow,
}: FilterRowProps) {
  // Don't show the row at all when there is nothing meaningful to filter
  // (only "All" available + no scenario tags). One pill in isolation is
  // visual noise; the original behaviour matches this.
  if (featuredCount === 0 && visibleTags.length === 0) return null;
  const tagsToRender = showOverflow ? [...visibleTags, ...overflowTags] : visibleTags;
  return (
    <div className="plugins-home__filters" role="tablist" aria-label="Plugin categories">
      {featuredCount > 0 ? (
        <FilterPill
          slug="featured"
          label="Featured"
          count={featuredCount}
          active={filter === 'featured'}
          variant="featured"
          onPick={onPick}
        />
      ) : null}
      <FilterPill
        slug="all"
        label="All"
        count={totalVisible}
        active={filter === 'all'}
        onPick={onPick}
      />
      {tagsToRender.map((tag) => (
        <FilterPill
          key={tag.slug}
          slug={tag.slug}
          label={tag.label}
          count={tag.count}
          active={filter === tag.slug}
          onPick={onPick}
        />
      ))}
      {overflowTags.length > 0 ? (
        <button
          type="button"
          className="plugins-home__filter plugins-home__filter--more"
          onClick={onToggleOverflow}
          data-testid="plugins-home-filter-more"
          aria-expanded={showOverflow}
        >
          <span>{showOverflow ? 'Less' : 'More'}</span>
          <span className="plugins-home__filter-count">
            {showOverflow ? '−' : `+${overflowTags.length}`}
          </span>
        </button>
      ) : null}
    </div>
  );
}

interface FilterPillProps {
  slug: PluginFilterKey;
  label: string;
  count: number;
  active: boolean;
  variant?: 'featured';
  onPick: (key: PluginFilterKey) => void;
}

function FilterPill({ slug, label, count, active, variant, onPick }: FilterPillProps) {
  const isFeatured = variant === 'featured';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[
        'plugins-home__filter',
        active ? 'is-active' : '',
        isFeatured ? 'plugins-home__filter--featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onPick(slug)}
      data-testid={`plugins-home-filter-${slug}`}
    >
      {isFeatured ? (
        <Icon name="star" size={11} className="plugins-home__filter-icon" />
      ) : null}
      <span>{label}</span>
      <span className="plugins-home__filter-count">{count}</span>
    </button>
  );
}
