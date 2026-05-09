// Trust resolver. Spec §5.3 has two tiers — `trusted` and `restricted`.
// Phase 1 keeps the policy minimal:
//
//   - Local installs default to `trusted` (the user copied the folder
//     here themselves).
//   - Anything else (bundled / marketplace / github / url / project) defaults
//     to `restricted` until an explicit `od plugin trust <id>` flips it. Phase
//     2A wires the marketplace trust roll-up; we just expose the helpers now.
//   - `restricted` plugins ship the prompt:inject capability only. Apply-time
//     adds explicit grants (e.g. `mcp:<name>`, `connector:<id>`) onto the
//     snapshot; we never widen the registry-stored cache here.

import type { InstalledPluginRecord, PluginManifest, TrustTier } from '@open-design/contracts';

export const TRUSTED_DEFAULT_CAPABILITIES: ReadonlyArray<string> = [
  'prompt:inject',
  'mcp:*',
  'connector:*',
  'genui:*',
  'pipeline:*',
];

export const RESTRICTED_DEFAULT_CAPABILITIES: ReadonlyArray<string> = ['prompt:inject'];

export function defaultTrustForRecord(record: Pick<InstalledPluginRecord, 'sourceKind'>): TrustTier {
  return record.sourceKind === 'local' ? 'trusted' : 'restricted';
}

export function defaultCapabilities(trust: TrustTier): string[] {
  return trust === 'trusted'
    ? Array.from(TRUSTED_DEFAULT_CAPABILITIES)
    : Array.from(RESTRICTED_DEFAULT_CAPABILITIES);
}

// Return the capabilities a manifest *requires* to apply cleanly. Apply-time
// grant decisions consult this; the doctor reports under-grants here too.
export function requiredCapabilities(manifest: PluginManifest): string[] {
  const required = new Set<string>(['prompt:inject']);
  const od = manifest.od;

  for (const mcp of od?.context?.mcp ?? []) {
    if (mcp?.name) required.add(`mcp:${mcp.name}`);
  }
  for (const ref of od?.connectors?.required ?? []) {
    if (ref?.id) required.add(`connector:${ref.id}`);
  }
  for (const ref of od?.connectors?.optional ?? []) {
    if (ref?.id) required.add(`connector:${ref.id}?`);
  }
  for (const surface of od?.genui?.surfaces ?? []) {
    if (surface?.kind) required.add(`genui:${surface.kind}`);
  }
  if ((od?.pipeline?.stages?.length ?? 0) > 0) {
    required.add('pipeline:*');
  }
  for (const cap of od?.capabilities ?? []) {
    if (typeof cap === 'string' && cap.length > 0) required.add(cap);
  }
  return Array.from(required.values()).sort();
}

// Compute the granted set Phase 1 applies for a given trust tier and
// manifest. Restricted plugins start at `prompt:inject`; trusted plugins
// receive everything required by their manifest plus the trusted defaults.
export function resolveCapabilitiesGranted(args: {
  manifest: PluginManifest;
  trust: TrustTier;
}): string[] {
  const out = new Set(defaultCapabilities(args.trust));
  if (args.trust === 'trusted') {
    for (const cap of requiredCapabilities(args.manifest)) {
      out.add(stripOptionalSuffix(cap));
    }
  }
  return Array.from(out.values()).sort();
}

function stripOptionalSuffix(cap: string): string {
  return cap.endsWith('?') ? cap.slice(0, -1) : cap;
}
