// Plan §3.F5 / spec §11.6 — Home plugin details inspector.
//
// Renders a self-contained, manifest-driven inspector for one
// InstalledPluginRecord from the PluginLoopHome card grid. The
// goal is "see everything before applying": example query, inputs
// schema, resolved context bundles, workflow stages, GenUI
// surfaces, connectors, capabilities, declared example outputs,
// and source provenance. Apply is reachable via the same
// `usePlugin` flow used by the card so the modal collapses into
// the existing PluginLoopHome state on confirm.
//
// Why a modal instead of a full-page route: PluginDetailView
// already exists at `/marketplace/<id>` for catalog browsing,
// but losing the user's draft prompt to a route change is hostile
// when they are mid-flow on Home. The modal keeps the prompt
// textarea + active-plugin chip alive underneath.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  InputField,
  InstalledPluginRecord,
  McpServerSpec,
  PluginConnectorRef,
  PluginManifest,
} from '@open-design/contracts';
import { Icon } from './Icon';
import { authorInitials, derivePluginSourceLinks } from '../runtime/plugin-source';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord) => void;
  isApplying?: boolean;
}

// `od.context.*` ref shape — manifest schema is permissive (`{ ref?, path? }`
// with passthrough). The inspector only needs a stable display label.
interface ContextRef {
  ref?: string;
  path?: string;
  primary?: boolean;
}

export function PluginDetailsModal({
  record,
  onClose,
  onUse,
  isApplying,
}: Props) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus to the close button on mount so keyboard users land
  // somewhere sensible without trapping them inside the long body.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const manifest: PluginManifest = record.manifest ?? ({} as PluginManifest);
  const od = manifest.od ?? {};
  const description = manifest.description ?? '';
  const query = od.useCase?.query ?? '';
  const inputs = (od.inputs ?? []) as InputField[];
  const ctx = od.context ?? {};
  const stages = od.pipeline?.stages ?? [];
  const surfaces = od.genui?.surfaces ?? [];
  const required = (od.connectors?.required ?? []) as PluginConnectorRef[];
  const optional = (od.connectors?.optional ?? []) as PluginConnectorRef[];
  const capabilities = od.capabilities ?? [];
  const examples = (od.useCase?.exampleOutputs ?? []) as Array<{
    path: string;
    title?: string;
  }>;
  const tags = manifest.tags ?? [];

  const hasContext = useMemo(() => {
    if (!ctx) return false;
    return Boolean(
      (ctx.skills && ctx.skills.length > 0) ||
        ctx.designSystem ||
        (ctx.craft && ctx.craft.length > 0) ||
        (ctx.assets && ctx.assets.length > 0) ||
        (ctx.mcp && ctx.mcp.length > 0) ||
        (ctx.atoms && ctx.atoms.length > 0) ||
        (ctx.claudePlugins && ctx.claudePlugins.length > 0),
    );
  }, [ctx]);

  function copyQuery() {
    if (!query) return;
    void navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  function refLabel(r: ContextRef): string {
    return r.ref ?? r.path ?? '';
  }

  function formattedInstalledAt(): string {
    try {
      return new Date(record.installedAt).toLocaleString();
    } catch {
      return String(record.installedAt);
    }
  }

  const installedLabel = formattedInstalledAt();

  // Source / author / contribute link derivation. Centralised in
  // ../runtime/plugin-source so the Home card can reuse the byline
  // shape and the parsing rules stay unit-tested in one place.
  const links = useMemo(() => derivePluginSourceLinks(record), [record]);
  const hasAuthorBlock = Boolean(
    links.authorName || links.authorProfileUrl || links.homepageUrl,
  );

  return (
    <div
      className="plugin-details-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${record.title} details`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="plugin-details-modal"
      data-plugin-id={record.id}
    >
      <div className="plugin-details-modal">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{record.title}</h2>
              <span
                className={`plugin-details-modal__trust trust-${record.trust}`}
              >
                {record.trust}
              </span>
            </div>
            <div className="plugin-details-modal__meta">
              <span>v{record.version}</span>
              {od.taskKind ? <span>· {od.taskKind}</span> : null}
              {od.kind ? <span>· {od.kind}</span> : null}
              <span>· {record.sourceKind}</span>
              {tags.length > 0 ? (
                <span className="plugin-details-modal__meta-tags">
                  {tags.slice(0, 4).map((t) => (
                    <span key={t} className="plugin-details-modal__tag">
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            aria-label="Close details"
            title="Close (Esc)"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          {description ? (
            <Section title="About">
              <p className="plugin-details-modal__description">
                {description}
              </p>
            </Section>
          ) : null}

          {query ? (
            <Section
              title="Example query"
              hint="Inserted into the prompt textarea when you apply this plugin."
              action={
                <button
                  type="button"
                  className="plugin-details-modal__chip-btn"
                  onClick={copyQuery}
                >
                  <Icon name="copy" size={12} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              }
            >
              <pre className="plugin-details-modal__query">{query}</pre>
            </Section>
          ) : null}

          {inputs.length > 0 ? (
            <Section
              title="Inputs"
              count={inputs.length}
              hint="Variables substituted into the example query at apply time."
            >
              <ul className="plugin-details-modal__inputs">
                {inputs.map((field) => (
                  <li
                    key={field.name}
                    className="plugin-details-modal__input"
                  >
                    <div className="plugin-details-modal__input-head">
                      <code>{field.name}</code>
                      {field.required ? (
                        <span className="plugin-details-modal__badge is-required">
                          required
                        </span>
                      ) : null}
                      {field.type ? (
                        <span className="plugin-details-modal__badge is-type">
                          {field.type}
                        </span>
                      ) : null}
                    </div>
                    {field.label ? (
                      <div className="plugin-details-modal__muted">
                        {field.label}
                      </div>
                    ) : null}
                    {field.placeholder ? (
                      <div className="plugin-details-modal__muted plugin-details-modal__small">
                        e.g. {field.placeholder}
                      </div>
                    ) : null}
                    {field.options && field.options.length > 0 ? (
                      <div className="plugin-details-modal__chips plugin-details-modal__chips--inline">
                        {field.options.map((opt) => (
                          <span
                            key={opt}
                            className="plugin-details-modal__chip"
                          >
                            {opt}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {field.default !== undefined &&
                    field.default !== null &&
                    String(field.default).length > 0 ? (
                      <div className="plugin-details-modal__muted plugin-details-modal__small">
                        default: <code>{String(field.default)}</code>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {hasContext ? (
            <Section
              title="Context bundles"
              hint="Skills, design systems, MCP servers and other refs the plugin will pull in at apply time."
            >
              <div className="plugin-details-modal__context">
                {ctx.skills && ctx.skills.length > 0 ? (
                  <ContextGroup
                    label="Skills"
                    count={ctx.skills.length}
                  >
                    {ctx.skills.map((s, i) => (
                      <span
                        key={`skill-${i}`}
                        className="plugin-details-modal__chip"
                      >
                        {refLabel(s as ContextRef)}
                      </span>
                    ))}
                  </ContextGroup>
                ) : null}
                {ctx.designSystem ? (
                  <ContextGroup label="Design system">
                    <span className="plugin-details-modal__chip">
                      {refLabel(ctx.designSystem as ContextRef)}
                      {(ctx.designSystem as ContextRef).primary ? (
                        <span className="plugin-details-modal__badge is-primary">
                          primary
                        </span>
                      ) : null}
                    </span>
                  </ContextGroup>
                ) : null}
                {ctx.craft && ctx.craft.length > 0 ? (
                  <ContextGroup label="Craft" count={ctx.craft.length}>
                    {ctx.craft.map((c) => (
                      <span
                        key={`craft-${c}`}
                        className="plugin-details-modal__chip"
                      >
                        {c}
                      </span>
                    ))}
                  </ContextGroup>
                ) : null}
                {ctx.atoms && ctx.atoms.length > 0 ? (
                  <ContextGroup label="Atoms" count={ctx.atoms.length}>
                    {ctx.atoms.map((a) => (
                      <span
                        key={`atom-${a}`}
                        className="plugin-details-modal__chip"
                      >
                        {a}
                      </span>
                    ))}
                  </ContextGroup>
                ) : null}
                {ctx.assets && ctx.assets.length > 0 ? (
                  <ContextGroup label="Assets" count={ctx.assets.length}>
                    {ctx.assets.map((a) => (
                      <span
                        key={`asset-${a}`}
                        className="plugin-details-modal__chip plugin-details-modal__chip--mono"
                      >
                        {a}
                      </span>
                    ))}
                  </ContextGroup>
                ) : null}
                {ctx.mcp && ctx.mcp.length > 0 ? (
                  <ContextGroup label="MCP servers" count={ctx.mcp.length}>
                    {(ctx.mcp as McpServerSpec[]).map((m) => (
                      <span
                        key={`mcp-${m.name}`}
                        className="plugin-details-modal__chip"
                      >
                        {m.name}
                      </span>
                    ))}
                  </ContextGroup>
                ) : null}
                {ctx.claudePlugins && ctx.claudePlugins.length > 0 ? (
                  <ContextGroup
                    label="Claude plugins"
                    count={ctx.claudePlugins.length}
                  >
                    {ctx.claudePlugins.map((p, i) => (
                      <span
                        key={`cp-${i}`}
                        className="plugin-details-modal__chip"
                      >
                        {refLabel(p as ContextRef)}
                      </span>
                    ))}
                  </ContextGroup>
                ) : null}
              </div>
            </Section>
          ) : null}

          {stages.length > 0 ? (
            <Section
              title="Workflow"
              count={stages.length}
              hint="Pipeline stages run in order. Atoms inside a stage run sequentially unless the stage repeats."
            >
              <ol className="plugin-details-modal__stages">
                {stages.map((stage, idx) => (
                  <li
                    key={`${stage.id}-${idx}`}
                    className="plugin-details-modal__stage"
                  >
                    <div className="plugin-details-modal__stage-head">
                      <span className="plugin-details-modal__stage-num">
                        {idx + 1}
                      </span>
                      <code className="plugin-details-modal__stage-id">
                        {stage.id}
                      </code>
                      {stage.repeat ? (
                        <span className="plugin-details-modal__badge is-repeat">
                          repeat
                        </span>
                      ) : null}
                      {stage.onFailure ? (
                        <span className="plugin-details-modal__badge is-failure">
                          on failure: {stage.onFailure}
                        </span>
                      ) : null}
                    </div>
                    {stage.atoms && stage.atoms.length > 0 ? (
                      <div className="plugin-details-modal__stage-atoms">
                        {stage.atoms.map((atom) => (
                          <code
                            key={`${stage.id}-${atom}`}
                            className="plugin-details-modal__atom"
                          >
                            {atom}
                          </code>
                        ))}
                      </div>
                    ) : null}
                    {stage.until ? (
                      <div className="plugin-details-modal__muted plugin-details-modal__small">
                        until: <code>{stage.until}</code>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {surfaces.length > 0 ? (
            <Section
              title="GenUI surfaces"
              count={surfaces.length}
              hint="Interactive prompts the plugin may surface during a run."
            >
              <ul className="plugin-details-modal__surfaces">
                {surfaces.map((s) => (
                  <li
                    key={s.id}
                    className="plugin-details-modal__surface"
                  >
                    <div className="plugin-details-modal__surface-head">
                      <code>{s.id}</code>
                      <span className="plugin-details-modal__badge is-type">
                        {s.kind}
                      </span>
                      {s.persist ? (
                        <span className="plugin-details-modal__muted plugin-details-modal__small">
                          persists at <code>{s.persist}</code>
                        </span>
                      ) : null}
                    </div>
                    {s.prompt ? (
                      <div className="plugin-details-modal__surface-prompt">
                        “{s.prompt}”
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {required.length > 0 || optional.length > 0 ? (
            <Section title="Connectors">
              {required.length > 0 ? (
                <ConnectorList
                  label="Required"
                  items={required}
                  variant="required"
                />
              ) : null}
              {optional.length > 0 ? (
                <ConnectorList
                  label="Optional"
                  items={optional}
                  variant="optional"
                />
              ) : null}
            </Section>
          ) : null}

          {capabilities.length > 0 ? (
            <Section
              title="Capabilities"
              count={capabilities.length}
              hint="Permissions the plugin requests when applied."
            >
              <div className="plugin-details-modal__caps">
                {capabilities.map((c) => (
                  <code
                    key={c}
                    className="plugin-details-modal__atom is-cap"
                  >
                    {c}
                  </code>
                ))}
              </div>
            </Section>
          ) : null}

          {examples.length > 0 ? (
            <Section
              title="Example outputs"
              count={examples.length}
              hint="Open in a new tab to see what runs from this plugin look like."
            >
              <ul className="plugin-details-modal__examples">
                {examples.map((e, idx) => {
                  const base =
                    e.path.split(/[\\/]/).filter(Boolean).pop() ?? `${idx}`;
                  const stem = base.replace(/\.[^.]+$/, '');
                  const name = e.title ?? stem;
                  return (
                    <li key={`${e.path}-${idx}`}>
                      <a
                        href={`/api/plugins/${encodeURIComponent(record.id)}/example/${encodeURIComponent(stem)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="plugin-details-modal__example-link"
                      >
                        <span>{name}</span>
                        <Icon name="external-link" size={12} />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {hasAuthorBlock ? (
            <Section
              title="Author"
              hint="Who maintains this plugin and where to follow them."
            >
              <div
                className="plugin-details-modal__author"
                data-testid="plugin-details-author"
              >
                <AuthorAvatar
                  name={links.authorName}
                  avatarUrl={links.authorAvatarUrl}
                />
                <div className="plugin-details-modal__author-meta">
                  {links.authorName ? (
                    <div className="plugin-details-modal__author-name">
                      {links.authorName}
                    </div>
                  ) : null}
                  <div className="plugin-details-modal__author-links">
                    {links.authorProfileUrl ? (
                      <ExternalLink
                        href={links.authorProfileUrl}
                        icon="github"
                        testId="plugin-details-author-profile"
                      >
                        {githubProfileLabel(links.authorProfileUrl)}
                      </ExternalLink>
                    ) : null}
                    {links.homepageUrl ? (
                      <ExternalLink
                        href={links.homepageUrl}
                        icon="external-link"
                        testId="plugin-details-author-homepage"
                      >
                        Homepage
                      </ExternalLink>
                    ) : null}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          <Section
            title="Source"
            action={
              links.contributeUrl ? (
                <a
                  className="plugin-details-modal__chip-btn"
                  href={links.contributeUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="plugin-details-contribute"
                  title={
                    links.contributeOnGithub
                      ? 'Open an issue on GitHub'
                      : 'Open the contribute page'
                  }
                >
                  <Icon
                    name={links.contributeOnGithub ? 'github' : 'external-link'}
                    size={12}
                  />
                  Contribute
                </a>
              ) : undefined
            }
          >
            <dl className="plugin-details-modal__source">
              <div>
                <dt>Origin</dt>
                <dd>
                  <span className="plugin-details-modal__source-kind">
                    {links.sourceKindLabel}
                  </span>
                  {links.sourceUrl ? (
                    <ExternalLink
                      href={links.sourceUrl}
                      icon={
                        record.sourceKind === 'github' ? 'github' : 'external-link'
                      }
                      testId="plugin-details-source-link"
                    >
                      {links.sourceLabel}
                    </ExternalLink>
                  ) : (
                    <code>{links.sourceLabel}</code>
                  )}
                </dd>
              </div>
              <div>
                <dt>Path</dt>
                <dd>
                  <code>{record.fsPath}</code>
                </dd>
              </div>
              {record.pinnedRef ? (
                <div>
                  <dt>Pinned ref</dt>
                  <dd>
                    <code>{record.pinnedRef}</code>
                  </dd>
                </div>
              ) : null}
              {record.sourceMarketplaceId ? (
                <div>
                  <dt>Marketplace ID</dt>
                  <dd>
                    <code>{record.sourceMarketplaceId}</code>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Installed</dt>
                <dd>{installedLabel}</dd>
              </div>
            </dl>
          </Section>
        </div>

        <footer className="plugin-details-modal__foot">
          <button
            type="button"
            className="plugin-details-modal__secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="plugin-details-modal__primary"
            onClick={() => onUse(record)}
            disabled={isApplying}
            aria-busy={isApplying ? 'true' : undefined}
            data-testid={`plugin-details-use-${record.id}`}
          >
            {isApplying
              ? 'Applying…'
              : query
                ? 'Use example query'
                : 'Use plugin'}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}

function Section({ title, count, hint, action, children }: SectionProps) {
  return (
    <section className="plugin-details-modal__section">
      <div className="plugin-details-modal__section-head">
        <h3 className="plugin-details-modal__section-title">
          {title}
          {typeof count === 'number' ? (
            <span className="plugin-details-modal__section-count">{count}</span>
          ) : null}
        </h3>
        {action ? (
          <div className="plugin-details-modal__section-action">{action}</div>
        ) : null}
      </div>
      {hint ? (
        <p className="plugin-details-modal__section-hint">{hint}</p>
      ) : null}
      <div className="plugin-details-modal__section-body">{children}</div>
    </section>
  );
}

interface ContextGroupProps {
  label: string;
  count?: number;
  children: ReactNode;
}

function ContextGroup({ label, count, children }: ContextGroupProps) {
  return (
    <div className="plugin-details-modal__ctx-group">
      <div className="plugin-details-modal__ctx-label">
        {label}
        {typeof count === 'number' ? (
          <span className="plugin-details-modal__ctx-count">{count}</span>
        ) : null}
      </div>
      <div className="plugin-details-modal__chips">{children}</div>
    </div>
  );
}

interface AuthorAvatarProps {
  name: string | null;
  avatarUrl: string | null;
}

function AuthorAvatar({ name, avatarUrl }: AuthorAvatarProps) {
  // Hide-on-error pattern: if the avatar URL 404s (e.g. the github
  // profile was renamed) we silently swap to the initials fallback
  // rather than showing a broken-image placeholder.
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <img
        className="plugin-details-modal__avatar"
        src={avatarUrl}
        alt={name ? `${name} avatar` : 'Author avatar'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="plugin-details-modal__avatar plugin-details-modal__avatar--fallback"
      aria-hidden
    >
      {authorInitials(name)}
    </span>
  );
}

interface ExternalLinkProps {
  href: string;
  icon: 'github' | 'external-link';
  children: ReactNode;
  testId?: string;
}

function ExternalLink({ href, icon, children, testId }: ExternalLinkProps) {
  return (
    <a
      className="plugin-details-modal__ext-link"
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
    >
      <Icon name={icon} size={12} />
      <span>{children}</span>
    </a>
  );
}

/** Strip the github.com prefix from a profile URL for compact display. */
function githubProfileLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (/^(?:www\.)?github\.com$/.test(parsed.hostname)) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 0) return `@${segments[0]}`;
    }
    return parsed.hostname + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

interface ConnectorListProps {
  label: string;
  items: PluginConnectorRef[];
  variant: 'required' | 'optional';
}

function ConnectorList({ label, items, variant }: ConnectorListProps) {
  return (
    <div className="plugin-details-modal__connector-group">
      <h4 className="plugin-details-modal__sub-title">
        {label}
        <span
          className={`plugin-details-modal__badge is-${variant}`}
        >
          {items.length}
        </span>
      </h4>
      <ul className="plugin-details-modal__connectors">
        {items.map((c) => (
          <li
            key={`${variant}-${c.id}`}
            className="plugin-details-modal__connector"
          >
            <code>{c.id}</code>
            {c.tools && c.tools.length > 0 ? (
              <span className="plugin-details-modal__muted plugin-details-modal__small">
                · {c.tools.join(', ')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
