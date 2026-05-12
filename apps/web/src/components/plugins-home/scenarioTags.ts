// Tag derivation + labelling for the Plugins home section.
//
// The home filter row is scenario-driven (per the migrate-to-plugins
// design): we no longer hard-code 4 buckets (Image / Video / Examples
// / Design). Instead every plugin emits a normalised set of tags
// (kebab-case slugs) and the section ranks tags by occurrence,
// surfacing the top N as pills with a "More" overflow.
//
// Centralising the derivation here lets the categorisation hook stay
// pure and lets tests assert tag membership without touching React.

import type { InstalledPluginRecord } from '@open-design/contracts';

// Slugs the user only ever sees because they bubble up from low-level
// plugin metadata. They never make for useful filter chips on the home
// page, so we drop them at derivation time. Keep the list small so an
// unexpected tag still reaches the UI for surfacing.
const NOISE_TAGS = new Set([
  'first-party',
  'third-party',
  'phase-7',
  'phase-1',
  'atom',
  'bundle',
  'scenario',
  'plugin',
]);

// Pretty labels for known scenario slugs. The renderer falls back to
// title-casing the slug for anything missing here, so this map only
// needs to cover the cases where humanise() would produce something
// awkward ("E-Commerce-Retail" instead of "E-commerce & retail").
const TAG_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  'image-template': 'Image template',
  'video-template': 'Video template',
  example: 'Example',
  'design-system': 'Design system',
  workflow: 'Workflow',
  marketing: 'Marketing',
  dashboard: 'Dashboard',
  landing: 'Landing',
  prototype: 'Prototype',
  mobile: 'Mobile',
  desktop: 'Desktop',
  web: 'Web',
  design: 'Design',
  engineering: 'Engineering',
  product: 'Product',
  sales: 'Sales',
  finance: 'Finance',
  hr: 'HR',
  operations: 'Operations',
  support: 'Support',
  'e-commerce-retail': 'E-commerce',
  'developer-tools': 'Developer tools',
  'new-generation': 'New generation',
  'code-migration': 'Code migration',
  'figma-migration': 'Figma migration',
  'tune-collab': 'Tune & collab',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function labelForTag(slug: string): string {
  const known = TAG_LABELS[slug];
  if (known) return known;
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Tags the user is most likely to recognise as a "scenario" pill. They
// get a stable position at the start of the pill row regardless of
// raw frequency, so the row never reshuffles when a new plugin lands.
const PINNED_ORDER = [
  'workflow',
  'example',
  'image',
  'video',
  'design-system',
];

interface ManifestExtras {
  featured?: boolean;
  surface?: string;
}

function manifestExtras(record: InstalledPluginRecord): ManifestExtras {
  const od = (record.manifest?.od ?? {}) as Record<string, unknown>;
  return {
    featured: od.featured === true,
    surface: typeof od.surface === 'string' ? (od.surface as string) : undefined,
  };
}

// Derive the set of normalised scenario tags for a single plugin. Two
// invariants the consumer can rely on:
//
//   1. Every multi-stage scenario plugin gets a synthetic `workflow`
//      tag so the user can filter scripted pipelines as a group.
//   2. `surface` and `mode` are added when present so type-style
//      categorisation (image / video / design-system) still works
//      without the renderer hard-coding any of them.
export function pluginTags(record: InstalledPluginRecord): string[] {
  const od = (record.manifest?.od ?? {}) as Record<string, unknown>;
  const raw: Array<string | undefined> = [];
  for (const t of record.manifest?.tags ?? []) raw.push(String(t));
  if (typeof od.scenario === 'string') raw.push(od.scenario);
  if (typeof od.mode === 'string') raw.push(od.mode);
  const surface = manifestExtras(record).surface;
  if (surface) raw.push(surface);
  if (typeof od.taskKind === 'string') raw.push(od.taskKind);
  if (typeof od.platform === 'string') raw.push(od.platform);

  const pipelineStages =
    od.pipeline && typeof od.pipeline === 'object'
      ? (od.pipeline as { stages?: unknown[] }).stages
      : undefined;
  if (Array.isArray(pipelineStages) && pipelineStages.length > 1) {
    raw.push('workflow');
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (!t) continue;
    const slug = slugify(t);
    if (!slug || NOISE_TAGS.has(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function isFeaturedPlugin(record: InstalledPluginRecord): boolean {
  return manifestExtras(record).featured === true;
}

export interface ScenarioTag {
  slug: string;
  label: string;
  count: number;
}

// Sort tags by frequency, with PINNED_ORDER tags floated to the top
// (still hidden when they have zero matches). Returns the catalog the
// pill row renders verbatim.
export function buildTagCatalog(plugins: InstalledPluginRecord[]): ScenarioTag[] {
  const counts = new Map<string, number>();
  for (const plugin of plugins) {
    for (const slug of pluginTags(plugin)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  const pinned = PINNED_ORDER.flatMap((slug) => {
    const count = counts.get(slug);
    if (!count) return [];
    return [{ slug, label: labelForTag(slug), count }];
  });
  const pinnedSlugs = new Set(PINNED_ORDER);
  const rest = Array.from(counts.entries())
    .filter(([slug]) => !pinnedSlugs.has(slug))
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([slug, count]) => ({ slug, label: labelForTag(slug), count }));
  return [...pinned, ...rest];
}
