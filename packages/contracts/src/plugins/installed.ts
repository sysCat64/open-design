import { z } from 'zod';
import { PluginManifestSchema } from './manifest.js';
import { TrustTierSchema, type TrustTier } from './marketplace.js';

// `installed_plugins.source_kind` — accepts `'bundled'` from Phase 1 even
// though `plugins/_official/` arrives in spec §23 / Phase 4 (plan F3). Keeps
// the enum permissive so the §23.3.5 patch is data-only.
export const PluginSourceKindSchema = z.enum([
  'bundled',
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

export type PluginSourceKind = z.infer<typeof PluginSourceKindSchema>;

export const InstalledPluginRecordSchema = z.object({
  id:                  z.string().min(1),
  title:               z.string(),
  version:             z.string(),
  sourceKind:          PluginSourceKindSchema,
  source:              z.string(),
  pinnedRef:           z.string().optional(),
  sourceDigest:        z.string().optional(),
  sourceMarketplaceId: z.string().optional(),
  trust:               TrustTierSchema,
  capabilitiesGranted: z.array(z.string()),
  manifest:            PluginManifestSchema,
  fsPath:              z.string(),
  installedAt:         z.number(),
  updatedAt:           z.number(),
});

export type InstalledPluginRecord = z.infer<typeof InstalledPluginRecordSchema>;

export const InstalledPluginListResponseSchema = z.object({
  plugins: z.array(InstalledPluginRecordSchema),
});

export type InstalledPluginListResponse = z.infer<typeof InstalledPluginListResponseSchema>;

export const PluginInstallSourceSchema = z.object({
  source: z.string().min(1),
  ref:    z.string().optional(),
});

export type PluginInstallSource = z.infer<typeof PluginInstallSourceSchema>;

// Re-export TrustTier so consumers can pull every plugin contract from one
// barrel without hopping through marketplace.ts.
export type { TrustTier };
