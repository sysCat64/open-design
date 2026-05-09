// Phase 7-8 entry slice / spec §10 / §11.5.1 / §21.5 — handoff atom.
//
// SKILL.md fragment lives at plugins/_official/atoms/handoff/. The
// daemon-side helper updates an ArtifactManifest's provenance +
// distribution metadata so subsequent runs (and the CLI's
// `od plugin export`) can reverse-resolve the artifact's lineage
// without mutating any prior fields. The contract is append-only:
//
//   - sourcePluginSnapshotId NEVER changes after first write.
//   - exportTargets[] / deployTargets[] only ever GROW.
//   - handoffKind can be promoted (e.g. 'patch' → 'deployable-app')
//     when build-test signals + diff-review acceptance combine.

import type {
  ArtifactDeployTarget,
  ArtifactExportTarget,
  ArtifactManifest,
  ArtifactProvenanceHandoffKind,
} from '@open-design/contracts';

export interface RecordHandoffInput {
  manifest: ArtifactManifest;
  exportTarget?: ArtifactExportTarget;
  deployTarget?: ArtifactDeployTarget;
  handoffKind?: ArtifactProvenanceHandoffKind;
  // When true (default), refuse to demote handoffKind back along the
  // axis 'design-only' < 'implementation-plan' < 'patch' < 'deployable-app'.
  // Setting false lets a roll-back path explicitly downgrade after a
  // failed deploy.
  enforceMonotonicHandoff?: boolean;
}

export interface RecordHandoffResult {
  manifest: ArtifactManifest;
  changed:  Array<'exportTargets' | 'deployTargets' | 'handoffKind'>;
}

const HANDOFF_RANK: Record<ArtifactProvenanceHandoffKind, number> = {
  'design-only':         0,
  'implementation-plan': 1,
  'patch':               2,
  'deployable-app':      3,
};

export function recordHandoff(input: RecordHandoffInput): RecordHandoffResult {
  const changed: RecordHandoffResult['changed'] = [];
  // Clone shallowly so the caller's reference isn't mutated; arrays
  // we touch get fresh copies before we push.
  const next: ArtifactManifest = { ...input.manifest };
  if (input.exportTarget) {
    const incoming = input.exportTarget;
    const existing = next.exportTargets ?? [];
    // Idempotency: a (surface, target) pair only ever lands once.
    const already = existing.some(
      (t: ArtifactExportTarget) => t.surface === incoming.surface && t.target === incoming.target,
    );
    if (!already) {
      next.exportTargets = [...existing, incoming];
      changed.push('exportTargets');
    }
  }
  if (input.deployTarget) {
    const incoming = input.deployTarget;
    const existing = next.deployTargets ?? [];
    const already = existing.some(
      (t: ArtifactDeployTarget) => t.provider === incoming.provider && t.location === incoming.location,
    );
    if (!already) {
      next.deployTargets = [...existing, incoming];
      changed.push('deployTargets');
    }
  }
  if (input.handoffKind) {
    const enforce = input.enforceMonotonicHandoff ?? true;
    const current = next.handoffKind;
    if (!current) {
      next.handoffKind = input.handoffKind;
      changed.push('handoffKind');
    } else {
      const incomingRank = HANDOFF_RANK[input.handoffKind] ?? 0;
      const currentRank = HANDOFF_RANK[current] ?? 0;
      if (!enforce || incomingRank >= currentRank) {
        if (current !== input.handoffKind) {
          next.handoffKind = input.handoffKind;
          changed.push('handoffKind');
        }
      }
    }
  }
  return { manifest: next, changed };
}

// Spec §11.5.1 promotion rule for the deployable-app tier:
// `handoffKind: 'deployable-app'` requires:
//   - build.passing  (the build-test atom emitted true)
//   - tests.passing  (same)
//   - at least one exportTargets[] entry on a 'docker' or 'cli' surface
//     (i.e. the patch was actually packaged for delivery)
//
// This helper computes the eligibility flag so the handoff atom's
// caller can promote in one place rather than leaking the rule into
// every plugin.
export function isDeployableAppEligible(args: {
  manifest: ArtifactManifest;
  buildPassing?: boolean;
  testsPassing?: boolean;
}): boolean {
  if (args.buildPassing !== true) return false;
  if (args.testsPassing !== true) return false;
  const exports = args.manifest.exportTargets ?? [];
  return exports.some((t: ArtifactExportTarget) => t.surface === 'docker' || t.surface === 'cli');
}
