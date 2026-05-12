// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectorDetail } from '@open-design/contracts';
import { LOCALE_LABEL, LOCALES, useI18n, useT, type Locale } from '../i18n';
import { navigate, useRoute } from '../router';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { CenteredLoader } from './Loading';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { GithubStarBadge } from './GithubStarBadge';
import { HomeView } from './HomeView';
import { Icon } from './Icon';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import { NewProjectModal } from './NewProjectModal';
import type { CreateInput } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import { UseEverywhereModal } from './UseEverywhereModal';

// Default scenario plugin for each project kind. The modal-based
// create flow no longer surfaces a plugin picker — every submission
// transparently binds the matching scenario so the project lands in a
// running pipeline. Add a row here when a kind-specific scenario
// plugin ships; until then everything routes through od-new-generation
// which already adapts on metadata.kind.
const DEFAULT_SCENARIO_PLUGIN_BY_KIND: Record<ProjectKind, string | null> = {
  prototype: 'od-new-generation',
  deck: 'od-new-generation',
  template: 'od-new-generation',
  image: 'od-new-generation',
  video: 'od-new-generation',
  audio: 'od-new-generation',
  other: 'od-new-generation',
};

function defaultPluginIdForKind(metadata: ProjectMetadata): string | null {
  return DEFAULT_SCENARIO_PLUGIN_BY_KIND[metadata.kind] ?? null;
}

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  connectors: ConnectorDetail[];
  connectorsLoading: boolean;
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  // Execution / model-switching context. Threaded down from `App` so the
  // top-bar `InlineModelSwitcher` can render the active mode/agent/model
  // and persist changes through the same callbacks the project view uses.
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onCreateProject: (
    input: CreateInput & {
      pendingPrompt?: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
      autoSendFirstMessage?: boolean;
    },
  ) => void;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'integrations'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'about',
  ) => void;
}

export function EntryShell({
  skills,
  designSystems,
  projects,
  templates,
  promptTemplates,
  defaultDesignSystemId,
  connectors,
  connectorsLoading,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onCreateProject,
  onImportClaudeDesign,
  onImportFolder,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onOpenSettings,
}: Props) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [useEverywhereOpen, setUseEverywhereOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  // The agent-handoff guide substitutes 127.0.0.1:7456 in every snippet
  // with whatever URL the user actually has open, so the curl examples
  // they paste into Hermes / openclaw / Cursor work without manual
  // editing. Falls back to the documented default when window is
  // unavailable (SSR / unit-test render).
  const liveDaemonUrl =
    typeof window !== 'undefined' ? window.location.origin : undefined;

  function changeView(next: EntryViewKind) {
    navigate({ kind: 'home', view: next });
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

  function handleCreate(input: CreateInput) {
    // The NewProjectModal no longer asks the user to pick a plugin.
    // Each project kind is silently bound to its default scenario
    // pipeline at creation time so the user lands in a running flow
    // without having to reason about pipeline internals. The mapping
    // is intentionally explicit so future kind-specific scenarios
    // (e.g. a deck- or image-specialized pipeline) can take over a
    // single row without touching the form.
    const pluginId = defaultPluginIdForKind(input.metadata);
    onCreateProject({
      ...input,
      ...(pluginId ? { pluginId } : {}),
    });
  }

  // Plan §3.F5 — the home prompt-loop submit path. The user picks a
  // plugin (which calls /api/plugins/:id/apply and binds a snapshot),
  // edits the rendered example query if any, then presses Enter. We
  // derive a project name from the active plugin (or prompt head),
  // forward the pluginId so POST /api/projects pins the snapshot to
  // project + conversation, and request auto-send of the first
  // message so the user lands inside a running pipeline.
  function handlePluginLoopSubmit(payload: PluginLoopSubmit) {
    const head = payload.prompt.trim().split(/\s+/).slice(0, 8).join(' ');
    const fallbackName = head.length > 0 ? head : 'Untitled';
    const name =
      payload.pluginTitle && payload.pluginTitle.trim().length > 0
        ? payload.pluginTitle.trim()
        : fallbackName;
    const metadata: ProjectMetadata = {
      kind: 'prototype',
    };
    onCreateProject({
      name,
      skillId: null,
      designSystemId: null,
      metadata,
      pendingPrompt: payload.prompt,
      ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
      ...(payload.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: payload.appliedPluginSnapshotId }
        : {}),
      autoSendFirstMessage: true,
    });
  }

  // Dismiss the avatar dropdown on outside-click / Escape so it
  // behaves like the project-view AvatarMenu (which uses the same
  // shell CSS). Collapse the inline language list whenever the
  // dropdown is closed, so the next open starts compact again.
  useEffect(() => {
    if (!avatarMenuOpen) {
      setLanguageExpanded(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  const avatarMenu = (
    <div className="avatar-menu" ref={avatarMenuRef}>
      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => setAvatarMenuOpen((v) => !v)}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={avatarMenuOpen}
      >
        <Icon name="settings" size={17} />
      </button>
      {avatarMenuOpen ? (
        <div className="avatar-popover" role="menu">
          <a
            className="avatar-item"
            href="https://x.com/nexudotio"
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setAvatarMenuOpen(false)}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="external-link" size={14} />
            </span>
            <span>Follow @nexudotio</span>
          </a>
          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />
          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={languageExpanded}
            onClick={() => setLanguageExpanded((v) => !v)}
            data-testid="entry-avatar-language"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="languages" size={14} />
            </span>
            <span>{t('settings.language')}</span>
            <span className="avatar-item-meta">{LOCALE_LABEL[locale]}</span>
            <Icon
              name={languageExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>
          {languageExpanded ? (
            <div className="avatar-language-list" role="group" aria-label={t('settings.language')}>
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setAvatarMenuOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{LOCALE_LABEL[code]}</span>
                    <span className="avatar-item-meta">{code}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              setUseEverywhereOpen(true);
            }}
            data-testid="entry-avatar-use-everywhere"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="link" size={14} />
            </span>
            <span>{t('entry.useEverywhereTitle')}</span>
          </button>
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className="entry">
        <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => setNewProjectOpen(true)}
        />
        <main className="entry-main entry-main--scroll">
          <div className="entry-main__topbar">
            <GithubStarBadge />
            <InlineModelSwitcher
              config={config}
              agents={agents}
              daemonLive={daemonLive}
              onModeChange={onModeChange}
              onAgentChange={onAgentChange}
              onAgentModelChange={onAgentModelChange}
              onApiProtocolChange={onApiProtocolChange}
              onApiModelChange={onApiModelChange}
              onOpenSettings={onOpenSettings}
            />
            <button
              type="button"
              className="use-everywhere-chip"
              onClick={() => setUseEverywhereOpen(true)}
              title={t('entry.useEverywhereTitle')}
              aria-label={t('entry.useEverywhereAria')}
              data-testid="entry-use-everywhere-button"
            >
              <span className="use-everywhere-chip__icon" aria-hidden>
                <Icon name="link" size={13} />
              </span>
              <span className="use-everywhere-chip__label">
                {t('entry.useEverywhereTitle')}
              </span>
            </button>
            {avatarMenu}
          </div>
          <div
            className={`entry-main__inner${
              view === 'home' ? '' : ' entry-main__inner--wide'
            }`}
          >
            {view === 'home' ? (
              <HomeView
                projects={projects}
                projectsLoading={projectsLoading}
                onSubmit={handlePluginLoopSubmit}
                onOpenProject={onOpenProject}
                onViewAllProjects={() => changeView('projects')}
              />
            ) : null}
            {view === 'projects' ? (
              projectsLoading || skillsLoading || designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">Projects</h1>
                  </header>
                  <DesignsTab
                    projects={projects}
                    skills={skills}
                    designSystems={designSystems}
                    onOpen={onOpenProject}
                    onOpenLiveArtifact={onOpenLiveArtifact}
                    onDelete={onDeleteProject}
                  />
                </div>
              )
            ) : null}
            {view === 'design-systems' ? (
              designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">Design systems</h1>
                  </header>
                  <DesignSystemsTab
                    systems={designSystems}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onPreview={(id) => setPreviewSystemId(id)}
                  />
                </div>
              )
            ) : null}
          </div>
        </main>
      </div>
      {previewSystem ? (
        <DesignSystemPreviewModal
          system={previewSystem}
          onClose={() => setPreviewSystemId(null)}
        />
      ) : null}
      <NewProjectModal
        open={newProjectOpen}
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={defaultDesignSystemId}
        templates={templates}
        promptTemplates={promptTemplates}
        connectors={connectors}
        connectorsLoading={connectorsLoading}
        loading={skillsLoading}
        onCreate={handleCreate}
        onImportClaudeDesign={onImportClaudeDesign}
        {...(onImportFolder ? { onImportFolder } : {})}
        onOpenConnectorsTab={() => onOpenSettings('composio')}
        onClose={() => setNewProjectOpen(false)}
      />
      {useEverywhereOpen ? (
        <UseEverywhereModal
          onClose={() => setUseEverywhereOpen(false)}
          onOpenSettings={() => {
            setUseEverywhereOpen(false);
            onOpenSettings('integrations');
          }}
          {...(liveDaemonUrl ? { daemonUrl: liveDaemonUrl } : {})}
        />
      ) : null}
    </div>
  );
}
