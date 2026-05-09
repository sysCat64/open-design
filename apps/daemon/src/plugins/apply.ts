// Plugin apply pipeline. Spec §11.5 / plan F4 invariants:
//
//   - Pure: no SQLite writes, no FS mutation, no network. Side effects
//     belong to the caller (snapshots.ts persists, server.ts wires the
//     SSE response, project create stages assets).
//   - Inputs are validated against `manifest.od.inputs`; missing required
//     fields raise `MissingInput` which the CLI/HTTP layer surfaces as 422.
//   - The output `ApplyResult` is the contract between apply and:
//       (a) `POST /api/projects` (project metadata + assets to stage)
//       (b) `runs.ts`           (snapshotId → systemPrompt block)
//       (c) the chip strip      (resolvedContext.items)
//
// The function is intentionally synchronous; future async resolution
// (e.g. live MCP capability probing) belongs in a wrapper that calls this.

import {
  manifestSourceDigest,
  resolveContext,
  type RegistryView,
} from '@open-design/plugin-runtime';
import type {
  AppliedPluginSnapshot,
  ApplyResult,
  InstalledPluginRecord,
  McpServerSpec,
  PluginAssetRef,
  PluginConnectorBinding,
  PluginConnectorRef,
  PluginManifest,
  PluginProjectMetadataPatch,
  TrustTier,
} from '@open-design/contracts';
import { resolveCapabilitiesGranted, requiredCapabilities } from './trust.js';

export class MissingInputError extends Error {
  readonly fields: string[];
  constructor(fields: string[]) {
    super(`Missing required plugin inputs: ${fields.join(', ')}`);
    this.fields = fields;
    this.name = 'MissingInputError';
  }
}

// Apply result narrows the trust tier to 'trusted' | 'restricted'. The
// installed-plugin record can carry 'bundled' (per §5.3); we coerce to
// 'trusted' at apply time so the snapshot's permission contract is binary.
export type ApplyTrust = 'trusted' | 'restricted';

export interface ApplyInput {
  plugin: InstalledPluginRecord;
  inputs: Record<string, unknown>;
  registry: RegistryView;
  trust?: TrustTier | undefined;
  // The active project's design system, if any. Plugins that declared
  // `od.context.designSystem.primary: true` without a concrete ref get
  // bound to this id at apply time.
  activeProjectDesignSystem?: { id: string; title?: string } | undefined;
}

export interface ApplyComputed {
  result: ApplyResult;
  // The manifestSourceDigest for the apply-time inputs. Distinct from the
  // ApplyResult so callers can pass it to snapshots.createSnapshot without
  // re-hashing.
  manifestSourceDigest: string;
  warnings: string[];
}

export function applyPlugin(input: ApplyInput): ApplyComputed {
  const manifest = input.plugin.manifest;
  const rawTrust: TrustTier = input.trust ?? input.plugin.trust;
  const trust: ApplyTrust = rawTrust === 'restricted' ? 'restricted' : 'trusted';

  const validated = validateInputs(manifest, input.inputs);
  if (validated.missing.length > 0) {
    throw new MissingInputError(validated.missing);
  }

  const resolved = resolveContext(manifest, {
    registry: {
      ...input.registry,
      activeProjectDesignSystem: input.activeProjectDesignSystem,
    },
    warnOnMissing: true,
  });

  const digest = manifestSourceDigest({
    manifest,
    inputs: validated.coerced,
    resolvedContextRefs: resolved.digestRefs,
  });

  const assets = buildAssetRefs(manifest);
  const mcpServers = manifest.od?.context?.mcp?.slice() ?? [];
  const connectorsRequired: PluginConnectorRef[] = [
    ...(manifest.od?.connectors?.required ?? []).map((r) => ({ ...r, required: true })),
    ...(manifest.od?.connectors?.optional ?? []).map((r) => ({ ...r, required: false })),
  ];
  const connectorsResolved: PluginConnectorBinding[] = connectorsRequired.map((c) => ({
    id: c.id,
    tools: Array.isArray(c.tools) ? c.tools : [],
    required: c.required,
    status: 'pending' as const,
  }));
  const required = requiredCapabilities(manifest);
  const granted = resolveCapabilitiesGranted({ manifest, trust });

  const taskKind = (manifest.od?.taskKind ?? 'new-generation') as AppliedPluginSnapshot['taskKind'];

  const projectMetadata: PluginProjectMetadataPatch = {
    name: manifest.title ?? manifest.name,
    taskKind,
  };
  const skillRef = pickFirstSkillId(manifest);
  if (skillRef) projectMetadata.skillId = skillRef;
  const dsId = pickDesignSystemId(manifest, input.activeProjectDesignSystem);
  if (dsId) projectMetadata.designSystemId = dsId;
  if (Array.isArray(manifest.od?.context?.craft) && manifest.od!.context!.craft!.length > 0) {
    projectMetadata.craftRequires = manifest.od!.context!.craft!.slice();
  }

  const queryText = typeof manifest.od?.useCase?.query === 'string'
    ? manifest.od.useCase.query
    : '';

  const appliedAt = Date.now();
  const snapshot: AppliedPluginSnapshot = {
    snapshotId:           '',
    pluginId:             input.plugin.id,
    pluginVersion:        input.plugin.version,
    manifestSourceDigest: digest,
    sourceMarketplaceId:  input.plugin.sourceMarketplaceId,
    pinnedRef:            input.plugin.pinnedRef,
    inputs:               validated.coerced,
    resolvedContext:      resolved.context,
    capabilitiesGranted:  granted,
    capabilitiesRequired: required,
    assetsStaged:         assets,
    taskKind,
    appliedAt,
    connectorsRequired,
    connectorsResolved,
    mcpServers,
    pipeline:             manifest.od?.pipeline,
    genuiSurfaces:        manifest.od?.genui?.surfaces ?? [],
    pluginTitle:          manifest.title ?? manifest.name,
    pluginDescription:    manifest.description,
    query:                queryText || undefined,
    status:               'fresh',
  };

  const result: ApplyResult = {
    query:               queryText,
    contextItems:        resolved.context.items,
    inputs:              manifest.od?.inputs ?? [],
    assets,
    mcpServers,
    pipeline:            manifest.od?.pipeline,
    genuiSurfaces:       manifest.od?.genui?.surfaces ?? [],
    projectMetadata,
    trust,
    capabilitiesGranted: granted,
    capabilitiesRequired: required,
    appliedPlugin: snapshot,
  };

  return { result, manifestSourceDigest: digest, warnings: resolved.warnings };
}

interface ValidationResult {
  coerced: Record<string, string | number | boolean>;
  missing: string[];
}

function validateInputs(manifest: PluginManifest, raw: Record<string, unknown>): ValidationResult {
  const fields = manifest.od?.inputs ?? [];
  const coerced: Record<string, string | number | boolean> = {};
  const missing: string[] = [];

  for (const field of fields) {
    const name = field.name;
    if (!name) continue;
    const provided = raw[name];
    if (provided === undefined || provided === null || provided === '') {
      const fallback = field.default;
      if (fallback !== undefined && fallback !== null && fallback !== '') {
        coerced[name] = coerceScalar(fallback as unknown);
      } else if (field.required === true) {
        missing.push(name);
      }
      continue;
    }
    coerced[name] = coerceScalar(provided);
  }

  // Forward-compat: pass through any extra keys the plugin author may have
  // defined elsewhere (e.g. via `od.useCase` later). This keeps inputs lossy
  // but predictable; the digest captures whatever survives coercion.
  for (const [key, value] of Object.entries(raw)) {
    if (key in coerced) continue;
    if (value === undefined || value === null) continue;
    coerced[key] = coerceScalar(value);
  }

  return { coerced, missing };
}

function coerceScalar(value: unknown): string | number | boolean {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}

function buildAssetRefs(manifest: PluginManifest): PluginAssetRef[] {
  const out: PluginAssetRef[] = [];
  for (const raw of manifest.od?.context?.assets ?? []) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const path = raw;
    out.push({ path, src: path, stageAt: 'run-start' });
  }
  return out;
}

function pickFirstSkillId(manifest: PluginManifest): string | undefined {
  for (const ref of manifest.od?.context?.skills ?? []) {
    const id = (ref?.ref ?? ref?.path ?? '').trim();
    if (id) return id.startsWith('./') ? id.slice(2) : id;
  }
  return undefined;
}

function pickDesignSystemId(
  manifest: PluginManifest,
  active?: { id: string; title?: string },
): string | undefined {
  const ds = manifest.od?.context?.designSystem;
  if (ds && typeof ds.ref === 'string' && ds.ref.trim()) return ds.ref.trim();
  if (ds && active?.id) return active.id;
  return undefined;
}

export function pluginPromptBlock(snapshot: AppliedPluginSnapshot): string {
  // Render the ## Active plugin / ## Plugin inputs block injected into
  // composeSystemPrompt. Plain markdown — `composeSystemPrompt` joins the
  // string verbatim. The block is intentionally short; rich content lives
  // in the active skill body / craft section.
  const lines: string[] = [];
  lines.push('\n\n## Active plugin');
  lines.push('');
  lines.push(
    `The user applied plugin **${snapshot.pluginTitle ?? snapshot.pluginId}** (\`${snapshot.pluginId}@${snapshot.pluginVersion}\`).`,
  );
  if (snapshot.pluginDescription) {
    lines.push('');
    lines.push(snapshot.pluginDescription.trim());
  }
  if (snapshot.query) {
    lines.push('');
    lines.push(`The plugin's example brief is: _${snapshot.query.trim()}_`);
  }

  const inputs = snapshot.inputs ?? {};
  const inputKeys = Object.keys(inputs).sort();
  if (inputKeys.length > 0) {
    lines.push('');
    lines.push('## Plugin inputs');
    lines.push('');
    lines.push('Treat these as authoritative answers to questions the plugin author baked into the brief — do not re-ask the user about them.');
    lines.push('');
    for (const key of inputKeys) {
      lines.push(`- **${key}**: ${formatInput(inputs[key])}`);
    }
  }

  const atomIds = snapshot.resolvedContext?.atoms ?? [];
  if (atomIds.length > 0) {
    lines.push('');
    lines.push('## Plugin atoms');
    lines.push('');
    lines.push('The plugin opted into these workflow atoms; prefer them over ad-hoc shortcuts:');
    lines.push('');
    for (const id of atomIds) lines.push(`- \`${id}\``);
  }

  return lines.join('\n');
}

function formatInput(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '(empty)';
  if (typeof value === 'string') return value.length > 0 ? value : '(empty)';
  return String(value);
}

export type { McpServerSpec };
