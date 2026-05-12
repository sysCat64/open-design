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
import type {
  DesignSystemSummary,
  Project,
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
import { HomeView } from './HomeView';
import { Icon } from './Icon';
import { NewProjectModal } from './NewProjectModal';
import type { CreateInput } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';

// Persisted under a redesign-scoped key so a future rebase against
// upstream's tab-based EntryView storage cannot collide on values.
const ENTRY_SHELL_VIEW_STORAGE_KEY = 'open-design:entry-view';

function loadInitialView(): EntryViewKind {
  if (typeof window === 'undefined') return 'home';
  try {
    const stored = window.localStorage.getItem(ENTRY_SHELL_VIEW_STORAGE_KEY);
    if (stored === 'home' || stored === 'projects' || stored === 'design-systems') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return 'home';
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
  const [view, setView] = useState<EntryViewKind>(() => loadInitialView());
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  function changeView(next: EntryViewKind) {
    setView(next);
    try {
      window.localStorage.setItem(ENTRY_SHELL_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

  function handleCreate(input: CreateInput) {
    onCreateProject(input);
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
          <div className="entry-main__topbar">{avatarMenu}</div>
          <div className="entry-main__inner">
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
    </div>
  );
}
