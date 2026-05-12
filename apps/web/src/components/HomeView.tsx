// Composed Home view — the top-down layout the entry view renders
// when the left nav rail's "Home" tab is active.
//
// Owns the prompt state + active plugin lifecycle and stitches
// together the smaller pieces (HomeHero, RecentProjectsStrip,
// PluginsHomeSection). Replaces the older left-side `PluginLoopHome`
// surface by lifting its plugin orchestration up here so the prompt
// textarea can live centered in the hero.

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApplyResult,
  InstalledPluginRecord,
  ProjectKind,
} from '@open-design/contracts';
import {
  applyPlugin,
  listPlugins,
  renderPluginBriefTemplate,
  resolvePluginQueryFallback,
} from '../state/projects';
import { useI18n } from '../i18n';
import type { Project } from '../types';
import { HomeHero } from './HomeHero';
import type { HomeHeroChip } from './home-hero/chips';
import {
  buildPluginAuthoringPrompt,
  PLUGIN_AUTHORING_PROMPT,
  type HomePromptHandoff,
} from './home-hero/plugin-authoring';
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import type { PluginLoopSubmit } from './PluginLoopHome';
import { RecentProjectsStrip } from './RecentProjectsStrip';

interface ActivePlugin {
  record: InstalledPluginRecord;
  result: ApplyResult;
  inputs: Record<string, unknown>;
  // Stage B of plugin-driven-flow-plan: when the user applied this
  // plugin through the Home chip rail, the chip carries the project
  // kind we should stamp on the resulting create payload. `null` =
  // applied through the search picker / PluginsHomeSection, where the
  // kind defaults to the historical 'prototype' value.
  projectKind: ProjectKind | null;
  chipId: string | null;
}

const AUTHORING_DEFAULT_SCENARIO_INPUTS = {
  artifactKind: 'Open Design plugin',
  audience: 'Open Design plugin authors',
  topic: 'packaging a reusable workflow as an Open Design plugin',
};

interface Props {
  projects: Project[];
  projectsLoading?: boolean;
  onSubmit: (payload: PluginLoopSubmit) => void;
  onOpenProject: (id: string) => void;
  onViewAllProjects: () => void;
  // Stage B: optional callbacks the rail's migration chips need.
  // HomeView itself never imports them; EntryShell threads them
  // through so the dispatcher can stay declarative.
  onImportFolder?: () => Promise<void> | void;
  onOpenNewProject?: (tab: 'template') => void;
  promptHandoff?: HomePromptHandoff | null;
}

export function HomeView({
  projects,
  projectsLoading,
  onSubmit,
  onOpenProject,
  onViewAllProjects,
  onImportFolder,
  onOpenNewProject,
  promptHandoff,
}: Props) {
  const { locale } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [pendingChipId, setPendingChipId] = useState<string | null>(null);
  const [pendingAuthoringChipId, setPendingAuthoringChipId] = useState<string | null>(null);
  const [pendingAuthoringPrompt, setPendingAuthoringPrompt] = useState(PLUGIN_AUTHORING_PROMPT);
  const [fallbackProjectKind, setFallbackProjectKind] = useState<ProjectKind | null>(null);
  const [active, setActive] = useState<ActivePlugin | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const consumedHandoffIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listPlugins().then((rows) => {
        if (cancelled) return;
        setPlugins(rows);
        setPluginsLoading(false);
      });
    };
    load();
    window.addEventListener('open-design:plugins-changed', load);
    return () => {
      cancelled = true;
      window.removeEventListener('open-design:plugins-changed', load);
    };
  }, []);

  useEffect(() => {
    if (!promptHandoff || consumedHandoffIdRef.current === promptHandoff.id) return;
    consumedHandoffIdRef.current = promptHandoff.id;
    setActive(null);
    setError(null);
    setFallbackProjectKind(promptHandoff.source === 'plugin-authoring' ? 'other' : null);
    setPrompt(promptHandoff.prompt);
    if (promptHandoff.focus) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (promptHandoff.source === 'plugin-authoring') {
      setPendingAuthoringChipId('plugin-authoring');
    }
  }, [promptHandoff]);

  const contextItemCount = useMemo(
    () => active?.result.contextItems?.length ?? 0,
    [active],
  );

  async function usePlugin(
    record: InstalledPluginRecord,
    nextPrompt?: string | null,
    options?: { projectKind?: ProjectKind; chipId?: string; inputs?: Record<string, unknown> },
  ) {
    setPendingApplyId(record.id);
    if (options?.chipId) setPendingChipId(options.chipId);
    setError(null);
    const result = await applyPlugin(record.id, { locale, inputs: options?.inputs });
    setPendingApplyId(null);
    setPendingChipId(null);
    if (!result) {
      setError(`Failed to apply ${record.title}. Make sure the daemon is reachable.`);
      return;
    }
    const inputs: Record<string, unknown> = { ...(options?.inputs ?? {}) };
    for (const field of result.inputs ?? []) {
      if (field.default !== undefined && inputs[field.name] === undefined) inputs[field.name] = field.default;
    }
    setActive({
      record,
      result,
      inputs,
      projectKind: options?.projectKind ?? null,
      chipId: options?.chipId ?? null,
    });
    setFallbackProjectKind(null);
    const query = result.query || resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
    if (nextPrompt !== undefined && nextPrompt !== null) {
      setPrompt(nextPrompt);
    } else if (query) {
      setPrompt(renderPluginBriefTemplate(query, inputs));
    }
    setDetailsRecord(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearActive() {
    setActive(null);
    setFallbackProjectKind(null);
    setPrompt('');
  }

  function queuePluginAuthoring(chipId: string | null, goal?: string) {
    const nextPrompt = goal ? buildPluginAuthoringPrompt(goal) : PLUGIN_AUTHORING_PROMPT;
    setActive(null);
    setFallbackProjectKind('other');
    setError(null);
    setPrompt(nextPrompt);
    setPendingAuthoringPrompt(nextPrompt);
    setPendingAuthoringChipId(chipId ?? 'plugin-authoring');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  useEffect(() => {
    if (!pendingAuthoringChipId || pluginsLoading) return;
    const authoringRecord = plugins.find((plugin) => plugin.id === 'od-plugin-authoring');
    const record = authoringRecord ?? plugins.find((plugin) => plugin.id === 'od-new-generation');
    setPendingAuthoringChipId(null);
    if (!record) {
      // The authoring scenario can be absent in a long-running dev
      // daemon that started before the bundled plugin was added. If
      // even the default scenario is missing, do not block the user:
      // keep the prompt in place and submit as a naked `other`
      // project so the server-side fallback can still attempt to bind.
      return;
    }
    void usePlugin(record, pendingAuthoringPrompt, {
      projectKind: 'other',
      chipId: pendingAuthoringChipId === 'plugin-authoring' ? undefined : pendingAuthoringChipId,
      ...(authoringRecord ? {} : { inputs: AUTHORING_DEFAULT_SCENARIO_INPUTS }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthoringChipId, pendingAuthoringPrompt, pluginsLoading, plugins]);

  // Stage B of plugin-driven-flow-plan: the chip rail dispatcher.
  // Pure UI-state mapping — the heavy lifting (apply / import) is
  // delegated back to existing handlers. Migration chips that don't
  // have a bound plugin (`import-folder`, `open-template-picker`)
  // forward to callbacks threaded in from EntryShell.
  function pickChip(chip: HomeHeroChip) {
    setError(null);
    switch (chip.action.kind) {
      case 'apply-scenario':
      case 'apply-figma-migration': {
        const targetId = chip.action.pluginId;
        const record = plugins.find((p) => p.id === targetId);
        if (!record) {
          setError(
            `Bundled scenario "${targetId}" is not installed. Reinstall the daemon to restore the default plugin set.`,
          );
          return;
        }
        void usePlugin(record, undefined, {
          projectKind: chip.action.projectKind,
          chipId: chip.id,
          inputs: chip.action.inputs,
        });
        return;
      }
      case 'create-plugin': {
        queuePluginAuthoring(chip.id);
        return;
      }
      case 'import-folder': {
        if (!onImportFolder) {
          setError('Folder import is not available in this shell.');
          return;
        }
        void onImportFolder();
        return;
      }
      case 'open-template-picker': {
        if (!onOpenNewProject) {
          setError('Template picker is not available in this shell.');
          return;
        }
        onOpenNewProject('template');
        return;
      }
    }
  }

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit({
      prompt: trimmed,
      pluginId: active?.record.id ?? null,
      appliedPluginSnapshotId: active?.result.appliedPlugin?.snapshotId ?? null,
      pluginTitle: active?.record.title ?? null,
      taskKind: active?.result.appliedPlugin?.taskKind ?? null,
      pluginInputs: active ? active.inputs : null,
      projectKind: active?.projectKind ?? fallbackProjectKind,
    });
  }

  return (
    <div className="home-view" data-testid="home-view">
      <HomeHero
        ref={inputRef}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={submit}
        activePluginTitle={active?.record.title ?? null}
        activeChipId={active?.chipId ?? null}
        onClearActivePlugin={clearActive}
        pluginOptions={plugins}
        pluginsLoading={pluginsLoading}
        pendingPluginId={pendingApplyId}
        pendingChipId={pendingChipId}
        submitDisabled={Boolean(pendingApplyId) || Boolean(pendingAuthoringChipId)}
        onPickPlugin={(record, nextPrompt) => void usePlugin(record, nextPrompt)}
        onPickChip={pickChip}
        contextItemCount={contextItemCount}
        error={error}
      />

      <RecentProjectsStrip
        projects={projects}
        {...(projectsLoading !== undefined ? { loading: projectsLoading } : {})}
        onOpen={onOpenProject}
        onViewAll={onViewAllProjects}
      />

      <PluginsHomeSection
        plugins={plugins}
        loading={pluginsLoading}
        activePluginId={active?.record.id ?? null}
        pendingApplyId={pendingApplyId}
        onUse={(record) => void usePlugin(record)}
        onOpenDetails={setDetailsRecord}
        onCreatePlugin={(goal) => queuePluginAuthoring(null, goal)}
      />

      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          onClose={() => setDetailsRecord(null)}
          onUse={(record) => void usePlugin(record)}
          isApplying={pendingApplyId === detailsRecord.id}
        />
      ) : null}
    </div>
  );
}
