// Lovart-style centered hero for the entry Home view.
//
// The prompt textarea is the canonical creation surface: the user
// either types freely or selects a plugin below to load an example
// query, then presses Run / Enter to spawn a project. The hero is
// kept dependency-free (no plugin list / project list) so it can be
// composed with the recent-projects strip and plugins section
// without owning their data lifecycles.

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { InstalledPluginRecord, McpServerConfig } from '@open-design/contracts';
import type { SkillSummary } from '../types';
import { Icon, type IconName } from './Icon';
import {
  chipsForGroup,
  type ChipGroup,
  type HomeHeroChip,
} from './home-hero/chips';

export interface HomeHeroSubmitHandler {
  (): void;
}

interface Props {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: HomeHeroSubmitHandler;
  activePluginTitle: string | null;
  activeChipId: string | null;
  onClearActivePlugin: () => void;
  activeSkillId?: string | null;
  activeSkillTitle?: string | null;
  onClearActiveSkill?: () => void;
  pluginOptions: InstalledPluginRecord[];
  pluginsLoading: boolean;
  skillOptions?: SkillSummary[];
  skillsLoading?: boolean;
  mcpOptions?: McpServerConfig[];
  mcpLoading?: boolean;
  pendingPluginId: string | null;
  pendingChipId: string | null;
  submitDisabled?: boolean;
  onPickPlugin: (record: InstalledPluginRecord, nextPrompt: string | null) => void;
  onPickSkill?: (skill: SkillSummary, nextPrompt: string | null) => void;
  onPickMcp?: (server: McpServerConfig, nextPrompt: string) => void;
  onPickChip: (chip: HomeHeroChip) => void;
  contextItemCount: number;
  error: string | null;
}

type HomeMentionTab = 'all' | 'plugins' | 'skills' | 'mcp';

interface HomeMentionOption {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  meta: string;
  disabled?: boolean;
  onPick: () => void;
}

interface HomeMentionSection {
  id: Exclude<HomeMentionTab, 'all'>;
  label: string;
  options: HomeMentionOption[];
}

export const HomeHero = forwardRef<HTMLTextAreaElement, Props>(function HomeHero(
  {
    prompt,
    onPromptChange,
    onSubmit,
    activePluginTitle,
    activeSkillId = null,
    activeSkillTitle = null,
    activeChipId,
    onClearActivePlugin,
    onClearActiveSkill = () => undefined,
    pluginOptions,
    pluginsLoading,
    skillOptions = [],
    skillsLoading = false,
    mcpOptions = [],
    mcpLoading = false,
    pendingPluginId,
    pendingChipId,
    submitDisabled = false,
    onPickPlugin,
    onPickSkill = () => undefined,
    onPickMcp = () => undefined,
    onPickChip,
    contextItemCount,
    error,
  },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTab, setMentionTab] = useState<HomeMentionTab>('all');
  const composingRef = useRef(false);
  const canSubmit = prompt.trim().length > 0 && !submitDisabled;
  const placeholder = activePluginTitle || activeSkillTitle
    ? 'Edit the example query or write your own…'
    : 'What do you want to design? Type a prompt, @search plugins, skills, or MCP…';
  const mention = getContextMention(prompt);
  const mentionActive = Boolean(mention);
  const mentionQuery = mention?.query ?? '';
  const pluginMatches = useMemo(
    () =>
      mentionActive
        ? pluginOptions.filter((plugin) => pluginMatchesQuery(plugin, mentionQuery)).slice(0, 6)
        : [],
    [mentionActive, mentionQuery, pluginOptions],
  );
  const skillMatches = useMemo(
    () =>
      mentionActive
        ? skillOptions.filter((skill) => skillMatchesQuery(skill, mentionQuery)).slice(0, 6)
        : [],
    [mentionActive, mentionQuery, skillOptions],
  );
  const mcpMatches = useMemo(
    () =>
      mentionActive
        ? mcpOptions.filter((server) => mcpServerMatchesQuery(server, mentionQuery)).slice(0, 6)
        : [],
    [mcpOptions, mentionActive, mentionQuery],
  );
  const pickerOpen = mentionActive;
  const tabs: Array<{ id: HomeMentionTab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: pluginMatches.length + skillMatches.length + mcpMatches.length },
    { id: 'plugins', label: 'Plugins', count: pluginMatches.length },
    { id: 'skills', label: 'Skills', count: skillMatches.length },
    { id: 'mcp', label: 'MCP', count: mcpMatches.length },
  ];
  const showPlugins = mentionTab === 'all' || mentionTab === 'plugins';
  const showSkills = mentionTab === 'all' || mentionTab === 'skills';
  const showMcp = mentionTab === 'all' || mentionTab === 'mcp';
  const visibleSections: HomeMentionSection[] = [
    showPlugins
      ? {
          id: 'plugins',
          label: 'Plugins',
          options: pluginMatches.map((plugin) => ({
            id: `plugin-${plugin.id}`,
            icon: 'sparkles',
            title: plugin.title,
            description: plugin.manifest?.description ?? plugin.id,
            meta: pendingPluginId === plugin.id ? 'Applying…' : getPluginSourceLabel(plugin),
            disabled: pendingPluginId !== null,
            onPick: () => pickPlugin(plugin),
          })),
        }
      : null,
    showSkills
      ? {
          id: 'skills',
          label: 'Skills',
          options: skillMatches.map((skill) => ({
            id: `skill-${skill.id}`,
            icon: skill.id === activeSkillId ? 'check' : 'file',
            title: skill.name,
            description: skill.description || skill.id,
            meta: skill.id === activeSkillId ? 'Active' : skill.mode,
            onPick: () => pickSkill(skill),
          })),
        }
      : null,
    showMcp
      ? {
          id: 'mcp',
          label: 'MCP',
          options: mcpMatches.map((server) => ({
            id: `mcp-${server.id}`,
            icon: 'link',
            title: server.label || server.id,
            description: server.url || server.command || server.id,
            meta: server.transport,
            onPick: () => pickMcp(server),
          })),
        }
      : null,
  ].filter((section): section is HomeMentionSection => Boolean(section?.options.length));
  const visiblePickerOptions = visibleSections.flatMap((section) => section.options);
  const visibleLoading =
    (mentionTab === 'all' && (pluginsLoading || skillsLoading || mcpLoading)) ||
    (mentionTab === 'plugins' && pluginsLoading) ||
    (mentionTab === 'skills' && skillsLoading) ||
    (mentionTab === 'mcp' && mcpLoading);

  useEffect(() => {
    if (selectedIndex >= visiblePickerOptions.length) setSelectedIndex(0);
  }, [selectedIndex, visiblePickerOptions.length]);

  function pickPlugin(record: InstalledPluginRecord) {
    const nextPrompt = mention ? replaceMentionToken(prompt, mention) : null;
    onPickPlugin(record, nextPrompt);
  }

  function pickSkill(skill: SkillSummary) {
    const nextPrompt = mention ? replaceMentionToken(prompt, mention) : null;
    onPickSkill(skill, nextPrompt);
  }

  function pickMcp(server: McpServerConfig) {
    const nextPrompt = mention
      ? replaceMentionTokenWithText(
          prompt,
          mention,
          `Use the \`${server.id}\` MCP server tools.`,
        )
      : prompt;
    onPickMcp(server, nextPrompt);
  }

  let optionRenderIndex = 0;

  return (
    <section className="home-hero" data-testid="home-hero">
      <div className="home-hero__brand" aria-hidden>
        <span className="home-hero__brand-mark">
          <img src="/app-icon.svg" alt="" draggable={false} />
        </span>
        <span className="home-hero__brand-name">Open Design</span>
      </div>
      <h1 className="home-hero__title">What do you want to design?</h1>
      <p className="home-hero__subtitle">
        Pick a plugin below to load an example query, or just type freely
        and press <kbd>Enter</kbd>.
      </p>

      <div className="home-hero__input-card">
        {activePluginTitle || activeSkillTitle ? (
          <div className="home-hero__active">
            {activePluginTitle ? (
              <span className="home-hero__active-chip" data-testid="home-hero-active-plugin">
                <span className="home-hero__active-dot" aria-hidden />
                <span>Plugin: {activePluginTitle}</span>
                <button
                  type="button"
                  className="home-hero__active-clear"
                  onClick={onClearActivePlugin}
                  aria-label="Clear active plugin"
                  title="Clear active plugin"
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeSkillTitle ? (
              <span
                className="home-hero__active-chip home-hero__active-chip--skill"
                data-testid="home-hero-active-skill"
              >
                <span className="home-hero__active-dot" aria-hidden />
                <span>Skill: {activeSkillTitle}</span>
                <button
                  type="button"
                  className="home-hero__active-clear"
                  onClick={onClearActiveSkill}
                  aria-label="Clear active skill"
                  title="Clear active skill"
                >
                  ×
                </button>
              </span>
            ) : null}
            {contextItemCount > 0 ? (
              <span className="home-hero__context-summary">
                {contextItemCount} context items resolved
              </span>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={ref}
          className="home-hero__input"
          data-testid="home-hero-input"
          value={prompt}
          onChange={(e) => {
            onPromptChange(e.target.value);
            setSelectedIndex(0);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(e) => {
            if (isImeComposing(e, composingRef.current)) return;
            if (pickerOpen && visiblePickerOptions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((idx) => (idx + 1) % visiblePickerOptions.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(
                  (idx) => (idx - 1 + visiblePickerOptions.length) % visiblePickerOptions.length,
                );
                return;
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                const selected = visiblePickerOptions[selectedIndex] ?? visiblePickerOptions[0];
                if (selected && !selected.disabled) selected.onPick();
                return;
              }
            }
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.altKey
            ) {
              e.preventDefault();
              if (pickerOpen && visiblePickerOptions.length > 0) {
                const selected = visiblePickerOptions[selectedIndex] ?? visiblePickerOptions[0];
                if (selected && !selected.disabled) selected.onPick();
                return;
              }
              if (canSubmit) onSubmit();
            }
          }}
          placeholder={placeholder}
          rows={3}
          aria-controls={pickerOpen ? 'home-hero-context-picker' : undefined}
          aria-expanded={pickerOpen}
        />
        {pickerOpen ? (
          <div
            id="home-hero-context-picker"
            className="home-hero__plugin-picker"
            role="listbox"
            aria-label="Context search results"
            data-testid="home-hero-plugin-picker"
          >
            <div className="home-hero__mention-tabs" role="tablist" aria-label="Context surfaces">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={mentionTab === item.id}
                  className={`home-hero__mention-tab${mentionTab === item.id ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setMentionTab(item.id);
                    setSelectedIndex(0);
                  }}
                >
                  <span>{item.label}</span>
                  {item.count > 0 ? <span>{item.count}</span> : null}
                </button>
              ))}
            </div>
            {visibleLoading && visiblePickerOptions.length === 0 ? (
              <div className="home-hero__plugin-picker-empty">Loading context…</div>
            ) : null}
            {!visibleLoading && visiblePickerOptions.length === 0 ? (
              <div className="home-hero__plugin-picker-empty">
                {mentionQuery ? (
                  <>No results for “{mentionQuery}”.</>
                ) : (
                  <>Search plugins, skills, and MCP servers.</>
                )}
              </div>
            ) : null}
            {visibleSections.map((section) => (
              <div key={section.id} className="home-hero__mention-section">
                <div className="home-hero__mention-section-label">{section.label}</div>
                {section.options.map((item) => {
                  const optionIndex = optionRenderIndex;
                  optionRenderIndex += 1;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={optionIndex === selectedIndex}
                      className={`home-hero__plugin-option${
                        optionIndex === selectedIndex ? ' is-active' : ''
                      }`}
                      onMouseEnter={() => setSelectedIndex(optionIndex)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        if (!item.disabled) item.onPick();
                      }}
                      disabled={item.disabled}
                    >
                      <span className="home-hero__plugin-option-icon" aria-hidden>
                        <Icon name={item.icon} size={13} />
                      </span>
                      <span className="home-hero__plugin-option-main">
                        <span>{item.title}</span>
                        <span>{item.description}</span>
                      </span>
                      <span className="home-hero__plugin-option-meta">
                        {item.meta}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
        <div className="home-hero__input-foot">
          <span className="home-hero__hint">
            <kbd>↵</kbd> to run · <kbd>Shift</kbd>+<kbd>↵</kbd> for new line
          </span>
          <button
            type="button"
            className="home-hero__submit"
            data-testid="home-hero-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
            title={canSubmit ? 'Run' : 'Type something to run'}
            aria-label="Run"
          >
            <Icon name="arrow-up" size={18} />
          </button>
        </div>
      </div>

      <div
        className="home-hero__rail"
        role="toolbar"
        aria-label="Pick a project category or starter shortcut"
        data-testid="home-hero-rail"
      >
        <RailGroup
          group="create"
          activeChipId={activeChipId}
          pendingChipId={pendingChipId}
          pendingPluginId={pendingPluginId}
          pluginsLoading={pluginsLoading}
          onPickChip={onPickChip}
        />
        <span className="home-hero__rail-divider" aria-hidden />
        <RailGroup
          group="migrate"
          activeChipId={activeChipId}
          pendingChipId={pendingChipId}
          pendingPluginId={pendingPluginId}
          pluginsLoading={pluginsLoading}
          onPickChip={onPickChip}
        />
      </div>

      {error ? (
        <div role="alert" className="home-hero__error">
          {error}
        </div>
      ) : null}
    </section>
  );
});

interface ContextMention {
  start: number;
  end: number;
  query: string;
}

function getContextMention(value: string): ContextMention | null {
  const start = value.lastIndexOf('@');
  if (start < 0) return null;
  const before = value[start - 1];
  if (before && !/\s/.test(before)) return null;
  const tail = value.slice(start + 1);
  const match = /^[^\s@]*/.exec(tail);
  if (!match) return null;
  return {
    start,
    end: start + 1 + match[0].length,
    query: match[0],
  };
}

function replaceMentionToken(value: string, mention: ContextMention): string | null {
  const before = value.slice(0, mention.start).trimEnd();
  const after = value.slice(mention.end).trimStart();
  const next = [before, after].filter(Boolean).join(' ').trim();
  return next.length > 0 ? next : null;
}

function replaceMentionTokenWithText(
  value: string,
  mention: ContextMention,
  replacement: string,
): string {
  const before = value.slice(0, mention.start).trimEnd();
  const after = value.slice(mention.end).trimStart();
  return [before, replacement.trim(), after].filter(Boolean).join(' ').trim();
}

function isImeComposing(event: ReactKeyboardEvent<HTMLTextAreaElement>, composing: boolean): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { keyCode?: number };
  return composing || nativeEvent.isComposing || nativeEvent.keyCode === 229;
}

function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function skillMatchesQuery(skill: SkillSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.mode,
    skill.surface ?? '',
    ...skill.triggers,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function getPluginSourceLabel(plugin: InstalledPluginRecord): string {
  return plugin.sourceKind === 'bundled' ? 'Official' : 'My plugin';
}

interface RailGroupProps {
  group: ChipGroup;
  activeChipId: string | null;
  pendingChipId: string | null;
  pendingPluginId: string | null;
  pluginsLoading: boolean;
  onPickChip: (chip: HomeHeroChip) => void;
}

function RailGroup({
  group,
  activeChipId,
  pendingChipId,
  pendingPluginId,
  pluginsLoading,
  onPickChip,
}: RailGroupProps) {
  const chips = useMemo(() => chipsForGroup(group), [group]);
  return (
    <div
      className={`home-hero__rail-group home-hero__rail-group--${group}`}
      data-rail-group={group}
    >
      {chips.map((chip) => {
        const isActive = activeChipId === chip.id;
        const isPending = pendingChipId === chip.id;
        const cls = ['home-hero__rail-chip', `home-hero__rail-chip--${group}`];
        if (isActive) cls.push('is-active');
        if (isPending) cls.push('is-pending');
        return (
          <button
            key={chip.id}
            type="button"
            className={cls.join(' ')}
            data-chip-id={chip.id}
            data-testid={`home-hero-rail-${chip.id}`}
            onClick={() => onPickChip(chip)}
            disabled={pluginsLoading || isPending || pendingPluginId !== null}
            aria-pressed={isActive}
            title={chip.hint ?? chip.label}
          >
            <Icon name={chip.icon} size={14} className="home-hero__rail-chip-icon" />
            <span className="home-hero__rail-chip-label">{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
