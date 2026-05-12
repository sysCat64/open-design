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
} from '@open-design/contracts';
import {
  applyPlugin,
  listPlugins,
  renderPluginBriefTemplate,
} from '../state/projects';
import type { Project } from '../types';
import { HomeHero } from './HomeHero';
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import type { PluginLoopSubmit } from './PluginLoopHome';
import { RecentProjectsStrip } from './RecentProjectsStrip';

interface ActivePlugin {
  record: InstalledPluginRecord;
  result: ApplyResult;
  inputs: Record<string, unknown>;
}

interface Props {
  projects: Project[];
  projectsLoading?: boolean;
  onSubmit: (payload: PluginLoopSubmit) => void;
  onOpenProject: (id: string) => void;
  onViewAllProjects: () => void;
}

export function HomeView({
  projects,
  projectsLoading,
  onSubmit,
  onOpenProject,
  onViewAllProjects,
}: Props) {
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [active, setActive] = useState<ActivePlugin | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listPlugins().then((rows) => {
      if (cancelled) return;
      setPlugins(rows);
      setPluginsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const contextItemCount = useMemo(
    () => active?.result.contextItems?.length ?? 0,
    [active],
  );

  async function usePlugin(record: InstalledPluginRecord) {
    setPendingApplyId(record.id);
    setError(null);
    const result = await applyPlugin(record.id, {});
    setPendingApplyId(null);
    if (!result) {
      setError(`Failed to apply ${record.title}. Make sure the daemon is reachable.`);
      return;
    }
    const inputs: Record<string, unknown> = {};
    for (const field of result.inputs ?? []) {
      if (field.default !== undefined) inputs[field.name] = field.default;
    }
    setActive({ record, result, inputs });
    const query = result.query ?? record.manifest?.od?.useCase?.query ?? '';
    if (query) {
      setPrompt(renderPluginBriefTemplate(query, inputs));
    }
    setDetailsRecord(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearActive() {
    setActive(null);
    setPrompt('');
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
        onClearActivePlugin={clearActive}
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
