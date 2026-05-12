// Stage B of plugin-driven-flow-plan — Home intent rail.
//
// The Home input card sits naked above an unstructured prompt. New
// users frequently type a request without knowing which scenario
// plugin to apply, which lands them in the generic agent path and
// stretches the convergence loop. This chip rail mirrors the
// NewProjectModal taxonomy plus a small set of migration shortcuts
// (Figma / folder / template), so the same Enter keystroke can hit a
// scenario-bound run.
//
// The catalog stays a pure data table:
//   - `id` — stable React key + test selector.
//   - `label` — English copy. Localisation can layer on later by
//     swapping this for a Dict lookup; keeping it inline lets the
//     rail ship without burning through 17 locale files for two
//     new strings (see plan §B / open questions).
//   - `icon` — name from the shared Icon registry.
//   - `action` — discriminated union the HomeView dispatcher matches
//     on. The rail component itself stays presentational.

import type { ProjectKind } from '@open-design/contracts';
import type { DefaultScenarioPluginId } from '@open-design/contracts';
import type { IconName } from '../Icon';

// Plugin ids the chip rail can dispatch to. Most chips route to a
// `DefaultScenarioPluginId` so the same fallback table the daemon
// uses for naked Home queries stays the source of truth. Specialised
// chips (HyperFrames lives under `plugins/_official/examples/hyperframes/`
// and surfaces as the `example-hyperframes` bundled plugin id) bypass
// the default table by carrying their own plugin id directly. The
// curated union keeps typo safety while letting the rail evolve
// independently of the default-binding mapping.
export type ChipScenarioPluginId =
  | DefaultScenarioPluginId
  | 'example-hyperframes';

export type ChipAction =
  | {
      kind: 'apply-scenario';
      pluginId: ChipScenarioPluginId;
      projectKind: ProjectKind;
      inputs?: Record<string, unknown>;
    }
  | {
      kind: 'apply-figma-migration';
      pluginId: 'od-figma-migration';
      projectKind: ProjectKind;
      inputs?: Record<string, unknown>;
    }
  | { kind: 'create-plugin' }
  | { kind: 'import-folder' }
  | { kind: 'open-template-picker' };

// Two intent groups: "create" = produce something new from scratch,
// "migrate" = start from an existing source. The grouping is structural
// only — HomeHero renders the two groups in separate flex containers so
// they wrap onto separate rows on narrow viewports without horizontal
// scrolling.
export type ChipGroup = 'create' | 'migrate';

export interface HomeHeroChip {
  id: string;
  label: string;
  icon: IconName;
  group: ChipGroup;
  hint?: string;
  action: ChipAction;
}

export const HOME_HERO_CHIPS: ReadonlyArray<HomeHeroChip> = [
  {
    id: 'prototype',
    label: 'Prototype',
    icon: 'palette',
    group: 'create',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      inputs: {
        artifactKind: 'interactive prototype',
        audience: 'product teams',
        topic: 'a new product experience',
      },
    },
  },
  {
    id: 'live-artifact',
    label: 'Live artifact',
    icon: 'pencil',
    group: 'create',
    hint: 'Build an interactive HTML/CSS/JS artifact you can preview live.',
    // No dedicated scenario plugin yet — the live-artifact authoring
    // flow shares od-new-generation's pipeline (file-write + live-
    // artifact atoms). We still surface it as a separate chip so the
    // user can pick their target surface up front instead of routing
    // through Prototype + a metadata flip.
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'prototype',
      inputs: {
        artifactKind: 'live HTML artifact',
        audience: 'product teams',
        topic: 'an interactive product concept',
      },
    },
  },
  {
    id: 'deck',
    label: 'Slide deck',
    icon: 'present',
    group: 'create',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'deck',
      inputs: {
        artifactKind: 'slide deck',
        audience: 'stakeholders',
        topic: 'a product strategy',
      },
    },
  },
  {
    id: 'image',
    label: 'Image',
    icon: 'image',
    group: 'create',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'image',
      inputs: {
        mediaKind: 'image',
        subject: 'a polished product concept',
        style: 'cinematic, high-quality, on-brand',
        aspect: '16:9',
      },
    },
  },
  {
    id: 'video',
    label: 'Video',
    icon: 'play',
    group: 'create',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'video',
      inputs: {
        mediaKind: 'video',
        subject: 'a short product reveal',
        style: 'cinematic, high-quality, on-brand',
        aspect: '16:9',
      },
    },
  },
  {
    id: 'hyperframes',
    label: 'HyperFrames',
    icon: 'orbit',
    group: 'create',
    hint: 'Author HTML-based motion: captions, audio-reactive visuals, scene transitions.',
    // HyperFrames is its own bundled scenario (motion-graphics
    // specialisation of Video). It surfaces in PluginsHomeSection's
    // primary category list, so the rail picks it up too rather than
    // hiding the specialised bucket behind the generic Video chip.
    action: { kind: 'apply-scenario', pluginId: 'example-hyperframes', projectKind: 'video' },
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'mic',
    group: 'create',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-media-generation',
      projectKind: 'audio',
      inputs: {
        mediaKind: 'audio',
        subject: 'a concise audio identity for a product',
        style: 'clear, polished, modern',
        aspect: '16:9',
      },
    },
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'sparkles',
    group: 'create',
    action: {
      kind: 'apply-scenario',
      pluginId: 'od-new-generation',
      projectKind: 'other',
      inputs: {
        artifactKind: 'design artifact',
        audience: 'the target audience',
        topic: 'the user request',
      },
    },
  },
  {
    id: 'create-plugin',
    label: 'Create plugin',
    icon: 'edit',
    group: 'create',
    hint: 'Author a reusable Open Design plugin and add it to My plugins.',
    action: { kind: 'create-plugin' },
  },
  {
    id: 'figma',
    label: 'From Figma',
    icon: 'import',
    group: 'migrate',
    hint: 'Migrate a Figma frame into the active design system.',
    action: {
      kind: 'apply-figma-migration',
      pluginId: 'od-figma-migration',
      projectKind: 'prototype',
      inputs: {
        figmaUrl: 'the Figma file URL you provide',
        targetStack: 'React 18 + Tailwind',
      },
    },
  },
  {
    id: 'folder',
    label: 'From folder',
    icon: 'folder',
    group: 'migrate',
    hint: 'Import an existing local folder and continue editing.',
    action: { kind: 'import-folder' },
  },
  {
    id: 'template',
    label: 'From template',
    icon: 'file-code',
    group: 'migrate',
    hint: 'Start from a bundled template.',
    action: { kind: 'open-template-picker' },
  },
];

export function chipsForGroup(group: ChipGroup): HomeHeroChip[] {
  return HOME_HERO_CHIPS.filter((c) => c.group === group);
}

// Helper used by tests + the rail component to pull the chip metadata
// off a click target without round-tripping through React state.
export function findChip(id: string): HomeHeroChip | undefined {
  return HOME_HERO_CHIPS.find((c) => c.id === id);
}
