// Single plugin card rendered inside the plugins-home grid. Kept as
// its own file so PluginsHomeSection.tsx can stay focused on the
// filter row + grid layout, and so card-only visual tweaks land
// without rerendering the whole categorisation contract.

import type { InstalledPluginRecord } from '@open-design/contracts';
import { Icon } from '../Icon';

interface Props {
  record: InstalledPluginRecord;
  isActive: boolean;
  isPending: boolean;
  pendingAny: boolean;
  isFeatured: boolean;
  onUse: (record: InstalledPluginRecord) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
}

export function PluginCard({
  record,
  isActive,
  isPending,
  pendingAny,
  isFeatured,
  onUse,
  onOpenDetails,
}: Props) {
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
            <Icon name="star" size={11} className="plugins-home__card-featured-mark" />
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
        {record.manifest?.od?.taskKind ? <span>{record.manifest.od.taskKind}</span> : null}
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
