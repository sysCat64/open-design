import { useEffect, useMemo, useState } from 'react';
import type { ApplyResult, InstalledPluginRecord, PluginSourceKind } from '@open-design/contracts';
import {
  applyPlugin,
  installPluginSource,
  listPluginMarketplaces,
  listPlugins,
  type PluginInstallOutcome,
  type PluginMarketplace,
  uploadPluginFolder,
  uploadPluginZip,
} from '../state/projects';
import { Icon } from './Icon';
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import { useI18n } from '../i18n';

type PluginsTab = 'community' | 'mine' | 'marketplaces' | 'team';

const USER_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

const PLUGINS_TABS: ReadonlyArray<{
  id: PluginsTab;
  label: string;
  hint: string;
  disabled?: boolean;
}> = [
  { id: 'community', label: 'Community', hint: 'Official catalog' },
  { id: 'mine', label: 'My plugins', hint: 'User-installed' },
  { id: 'marketplaces', label: 'Marketplaces', hint: 'Coming soon', disabled: true },
  { id: 'team', label: 'Team / Enterprise', hint: 'Coming soon' },
];

export function PluginsView({ onCreatePlugin }: { onCreatePlugin?: (goal?: string) => void }) {
  const { locale } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [marketplaces, setMarketplaces] = useState<PluginMarketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PluginsTab>('community');
  const [importOpen, setImportOpen] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [activePlugin, setActivePlugin] = useState<{
    record: InstalledPluginRecord;
    result: ApplyResult;
  } | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [notice, setNotice] = useState<PluginInstallOutcome | { ok: boolean; message: string } | null>(null);

  async function refresh() {
    setLoading(true);
    const [rows, catalogs] = await Promise.all([listPlugins(), listPluginMarketplaces()]);
    setPlugins(rows);
    setMarketplaces(catalogs);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    window.addEventListener('open-design:plugins-changed', refresh);
    return () => window.removeEventListener('open-design:plugins-changed', refresh);
  }, []);

  const officialPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.sourceKind === 'bundled'),
    [plugins],
  );
  const userPlugins = useMemo(
    () => plugins.filter((plugin) => USER_SOURCE_KINDS.has(plugin.sourceKind)),
    [plugins],
  );

  async function finishImport(work: () => Promise<PluginInstallOutcome>) {
    setNotice(null);
    const outcome = await work();
    setNotice(outcome);
    if (outcome.ok) {
      setImportOpen(false);
      await refresh();
      setActiveTab('mine');
    }
    return outcome;
  }

  async function handleUsePlugin(record: InstalledPluginRecord) {
    setPendingApplyId(record.id);
    setNotice(null);
    const result = await applyPlugin(record.id, { locale });
    setPendingApplyId(null);
    if (!result) {
      setNotice({
        ok: false,
        message: `Failed to apply ${record.title}. Make sure the daemon is reachable.`,
      });
      return;
    }
    setActivePlugin({ record, result });
    setDetailsRecord(null);
    setNotice({
      ok: true,
      message: `${record.title} is ready. Use it from Home with @ search or pick it from the gallery.`,
    });
  }

  return (
    <section className="plugins-view" aria-labelledby="plugins-title">
      <header className="plugins-view__hero">
        <div>
          <p className="plugins-view__kicker">Plugins</p>
          <h1 id="plugins-title" className="entry-section__title">
            Plugins
          </h1>
          <p className="plugins-view__lede">
            Browse plugins by workflow: import sources, create artifacts,
            export downstream, refine existing work, or extend the catalog.
          </p>
        </div>
        <div className="plugins-view__hero-actions">
          <button
            type="button"
            className="plugins-view__primary"
            onClick={() => onCreatePlugin?.()}
            data-testid="plugins-create-button"
          >
            <Icon name="edit" size={13} />
            <span>Create plugin</span>
          </button>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={() => setImportOpen(true)}
            aria-haspopup="dialog"
            data-testid="plugins-import-button"
          >
            <Icon name="plus" size={13} />
            <span>Import plugin</span>
          </button>
          <div className="plugins-view__badge" aria-hidden="true">
            <Icon name="grid" size={15} />
            <span>Agent context</span>
          </div>
        </div>
      </header>

      <div className="plugins-view__stats" aria-label="Plugin summary">
        <StatCard label="Official" value={officialPlugins.length} />
        <StatCard label="My plugins" value={userPlugins.length} />
        <StatCard label="Marketplaces" value={marketplaces.length} />
      </div>

      <nav className="plugins-view__tabs" role="tablist" aria-label="Plugin areas">
        {PLUGINS_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={tab.disabled ? 'true' : undefined}
              disabled={tab.disabled}
              className={[
                'plugins-view__tab',
                active ? ' is-active' : '',
                tab.disabled ? ' is-disabled' : '',
              ]
                .filter(Boolean)
                .join('')}
              onClick={() => {
                if (!tab.disabled) setActiveTab(tab.id);
              }}
              data-testid={`plugins-tab-${tab.id}`}
            >
              <span className="plugins-view__tab-label">{tab.label}</span>
              <span className="plugins-view__tab-hint">{tab.hint}</span>
            </button>
          );
        })}
      </nav>

      {notice ? <Notice outcome={notice} /> : null}

      <div className="plugins-view__gallery">
        {loading ? <div className="plugins-view__empty">Loading plugins…</div> : null}

        {!loading && activeTab === 'community' ? (
          <PluginsHomeSection
            plugins={officialPlugins}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
            onUse={(record) => void handleUsePlugin(record)}
            onOpenDetails={setDetailsRecord}
            onCreatePlugin={onCreatePlugin}
            title="Community"
            subtitle="Import, create, export, refine, or extend Open Design — packaged as plugins. Pick one to load a starter prompt, or use @ search from Home."
            emptyMessage="No official plugins are registered yet. Restart the daemon if this looks wrong."
          />
        ) : null}

        {!loading && activeTab === 'mine' ? (
          <PluginsHomeSection
            plugins={userPlugins}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
            onUse={(record) => void handleUsePlugin(record)}
            onOpenDetails={setDetailsRecord}
            onCreatePlugin={onCreatePlugin}
            title="My plugins"
            subtitle="Your imported workflow plugins. Tag them by intent so they appear beside the official Import, Create, Export, Refine, and Extend starters."
            emptyMessage="No user plugins yet. Use Create / Import to install from GitHub, a daemon-local path, an HTTPS archive, or a marketplace name."
          />
        ) : null}

        {!loading && activeTab === 'marketplaces' ? (
          <MarketplacesPanel marketplaces={marketplaces} />
        ) : null}

        {activeTab === 'team' ? <TeamPanel /> : null}
      </div>

      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          onClose={() => setDetailsRecord(null)}
          onUse={(record) => void handleUsePlugin(record)}
          isApplying={pendingApplyId === detailsRecord.id}
        />
      ) : null}
      {importOpen ? (
        <PluginImportModal
          onClose={() => setImportOpen(false)}
          onInstallSource={(source) => finishImport(() => installPluginSource(source))}
          onUploadZip={(file) => finishImport(() => uploadPluginZip(file))}
          onUploadFolder={(files) => finishImport(() => uploadPluginFolder(files))}
        />
      ) : null}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="plugins-view__stat">
      <span className="plugins-view__stat-value">{value}</span>
      <span className="plugins-view__stat-label">{label}</span>
    </div>
  );
}

function Notice({
  outcome,
}: {
  outcome: PluginInstallOutcome | { ok: boolean; message: string };
}) {
  const warnings = 'warnings' in outcome ? outcome.warnings : [];
  const log = 'log' in outcome ? outcome.log : [];
  return (
    <div className={`plugins-view__notice${outcome.ok ? ' is-success' : ' is-error'}`} role="status">
      <div>{outcome.message}</div>
      {warnings.length > 0 ? (
        <div className="plugins-view__notice-sub">
          {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </div>
      ) : null}
      {log.length > 0 ? (
        <details className="plugins-view__notice-log">
          <summary>Install log</summary>
          <ul>
            {log.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function MarketplacesPanel({ marketplaces }: { marketplaces: PluginMarketplace[] }) {
  return (
    <section className="plugins-view__section" aria-labelledby="plugins-marketplaces-title">
      <div className="plugins-view__section-head">
        <div>
          <h2 id="plugins-marketplaces-title">Configured marketplaces</h2>
          <p>Marketplace manifests can resolve bare plugin names during install.</p>
        </div>
        <span className="plugins-view__section-count">{marketplaces.length}</span>
      </div>
      {marketplaces.length === 0 ? (
        <div className="plugins-view__empty">
          No marketplaces registered yet. Add one with <code>od marketplace add &lt;url&gt;</code>.
        </div>
      ) : (
        <div className="plugins-view__marketplaces">
          {marketplaces.map((marketplace) => (
            <article key={marketplace.id} className="plugins-view__marketplace">
              <div>
                <h3>{marketplace.manifest.name ?? marketplace.url}</h3>
                <a href={marketplace.url} target="_blank" rel="noreferrer">
                  {marketplace.url}
                </a>
              </div>
              <div className="plugins-view__meta">
                <span>{marketplace.trust}</span>
                <span>{marketplace.manifest.plugins?.length ?? 0} plugins</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type ImportKind = 'github' | 'zip' | 'folder' | 'template';

function PluginImportModal({
  onClose,
  onInstallSource,
  onUploadZip,
  onUploadFolder,
}: {
  onClose: () => void;
  onInstallSource: (source: string) => Promise<PluginInstallOutcome>;
  onUploadZip: (file: File) => Promise<PluginInstallOutcome>;
  onUploadFolder: (files: File[]) => Promise<PluginInstallOutcome>;
}) {
  const [kind, setKind] = useState<ImportKind>('github');
  const [source, setSource] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);

  async function runImport() {
    setWorking(true);
    try {
      if (kind === 'github') {
        const trimmed = source.trim();
        if (trimmed) await onInstallSource(trimmed);
      } else if (kind === 'zip' && zipFile) {
        await onUploadZip(zipFile);
      } else if (kind === 'folder' && folderFiles.length > 0) {
        await onUploadFolder(folderFiles);
      }
    } finally {
      setWorking(false);
    }
  }

  const canSubmit =
    (kind === 'github' && source.trim().length > 0) ||
    (kind === 'zip' && zipFile !== null) ||
    (kind === 'folder' && folderFiles.length > 0);

  return (
    <div className="plugins-import-modal__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="plugins-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugins-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="plugins-import-modal__head">
          <div>
            <p className="plugins-view__kicker">User plugins</p>
            <h2 id="plugins-import-title">Create or import a plugin</h2>
          </div>
          <button
            type="button"
            className="plugins-import-modal__close"
            onClick={onClose}
            aria-label="Close import dialog"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <nav className="plugins-import-modal__tabs" aria-label="Import source">
          <ImportChoice
            active={kind === 'github'}
            icon="github"
            title="From GitHub"
            body="Install github:owner/repo paths."
            onClick={() => setKind('github')}
          />
          <ImportChoice
            active={kind === 'zip'}
            icon="upload"
            title="Upload zip"
            body="Upload a plugin archive."
            onClick={() => setKind('zip')}
          />
          <ImportChoice
            active={kind === 'folder'}
            icon="folder"
            title="Upload folder"
            body="Upload a plugin directory."
            onClick={() => setKind('folder')}
          />
          <ImportChoice
            active={kind === 'template'}
            icon="edit"
            title="Create from template"
            body="Coming soon."
            onClick={() => setKind('template')}
          />
        </nav>

        <div className="plugins-import-modal__body">
          {kind === 'github' ? (
            <div className="plugins-view__install-card">
              <label htmlFor="plugin-source">GitHub, archive, or marketplace source</label>
              <div className="plugins-view__source-row">
                <input
                  id="plugin-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="github:owner/repo@main/plugins/my-plugin"
                  disabled={working}
                />
                <button
                  type="button"
                  className="plugins-view__primary"
                  onClick={runImport}
                  disabled={working || !canSubmit}
                >
                  {working ? 'Importing…' : 'Import'}
                </button>
              </div>
              <div className="plugins-view__source-help">
                Supports <code>github:owner/repo[@ref][/subpath]</code>, HTTPS{' '}
                <code>.tar.gz</code>/<code>.tgz</code> archives, or marketplace plugin names.
              </div>
            </div>
          ) : null}

          {kind === 'zip' ? (
            <FileImportPanel
              title="Upload zip"
              body="Choose a .zip archive containing open-design.json, SKILL.md, or .claude-plugin/plugin.json."
              accept=".zip,application/zip"
              working={working}
              fileLabel={zipFile?.name ?? 'No zip selected'}
              onChange={(files) => setZipFile(files[0] ?? null)}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

          {kind === 'folder' ? (
            <FileImportPanel
              title="Upload folder"
              body="Choose a plugin folder. Relative paths are preserved and installed into your user plugin registry."
              working={working}
              fileLabel={
                folderFiles.length > 0
                  ? `${folderFiles.length} file${folderFiles.length === 1 ? '' : 's'} selected`
                  : 'No folder selected'
              }
              folder
              onChange={setFolderFiles}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

          {kind === 'template' ? (
            <section className="plugins-import-modal__coming">
              <span className="plugins-view__future-icon" aria-hidden>
                <Icon name="edit" size={18} />
              </span>
              <div>
                <p className="plugins-view__kicker">Coming soon</p>
                <h3>Create from template</h3>
                <p>
                  Template authoring will scaffold manifest metadata, examples,
                  preview assets, and starter instructions in a future pass.
                </p>
              </div>
            </section>
          ) : null}
        </div>

        <footer className="plugins-import-modal__foot">
          <p>
            Imported plugins are user plugins and are stored separately from
            bundled official plugins.
          </p>
          <button
            type="button"
            className="plugins-view__secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}

function ImportChoice({
  active,
  icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: 'github' | 'upload' | 'folder' | 'edit';
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`plugins-import-modal__choice${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span className="plugins-import-modal__choice-icon" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="plugins-import-modal__choice-copy">
        <span>{title}</span>
        <span>{body}</span>
      </span>
    </button>
  );
}

function FileImportPanel({
  title,
  body,
  accept,
  working,
  fileLabel,
  folder,
  canSubmit,
  onChange,
  onImport,
}: {
  title: string;
  body: string;
  accept?: string;
  working: boolean;
  fileLabel: string;
  folder?: boolean;
  canSubmit: boolean;
  onChange: (files: File[]) => void;
  onImport: () => void;
}) {
  return (
    <section className="plugins-view__install-card">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <label className="plugins-import-modal__file">
        <input
          type="file"
          data-testid={folder ? 'plugins-folder-input' : 'plugins-zip-input'}
          {...(accept ? { accept } : {})}
          {...(folder ? { webkitdirectory: '', directory: '' } : {})}
          multiple={folder}
          disabled={working}
          onChange={(event) => onChange(Array.from(event.currentTarget.files ?? []))}
        />
        <span>{fileLabel}</span>
      </label>
      <button
        type="button"
        className="plugins-view__primary"
        onClick={onImport}
        disabled={working || !canSubmit}
      >
        {working ? 'Importing…' : 'Import'}
      </button>
    </section>
  );
}

function TeamPanel() {
  return (
    <section className="plugins-view__team" aria-labelledby="plugins-team-title">
      <span className="plugins-view__future-icon" aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <div>
        <p className="plugins-view__kicker">Coming soon</p>
        <h2 id="plugins-team-title">Private team marketplaces</h2>
        <p>
          This area is reserved for enterprise and team catalogs, private trust
          policies, and shared plugin lifecycle controls.
        </p>
      </div>
    </section>
  );
}
