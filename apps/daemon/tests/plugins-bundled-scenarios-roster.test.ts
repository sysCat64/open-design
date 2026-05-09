// Plan §3.N4 / spec §23.3.3 — bundled scenario plugins roster.
//
// Each `taskKind` enum value (new-generation / code-migration /
// figma-migration / tune-collab) maps to exactly one bundled
// `od.kind: 'scenario'` plugin under
// `plugins/_official/scenarios/`. The daemon's bundled boot walker
// registers them so a future PR that wires "no od.pipeline → look
// up the matching scenario" has a stable lookup target.

import path from 'node:path';
import url from 'node:url';
import { readFile, readdir, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const scenariosRoot = path.join(repoRoot, 'plugins', '_official', 'scenarios');

const EXPECTED = new Map<string, { taskKind: string; pipelineStages: string[] }>([
  ['od-new-generation',  { taskKind: 'new-generation',  pipelineStages: ['discovery', 'plan', 'generate', 'critique'] }],
  ['od-figma-migration', { taskKind: 'figma-migration', pipelineStages: ['extract', 'tokens', 'generate', 'critique'] }],
  ['od-code-migration',  { taskKind: 'code-migration',  pipelineStages: ['import', 'tokens', 'plan', 'verify', 'review', 'handoff'] }],
  ['od-tune-collab',     { taskKind: 'tune-collab',     pipelineStages: ['direction', 'patch', 'critique', 'handoff'] }],
]);

describe('plugins/_official/scenarios roster', () => {
  it('contains exactly one folder per taskKind', async () => {
    const entries = await readdir(scenariosRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(dirs).toEqual(Array.from(EXPECTED.keys()).sort());
  });

  for (const [folder, expected] of EXPECTED) {
    it(`${folder} declares od.kind='scenario' + the canonical pipeline shape`, async () => {
      const manifestPath = path.join(scenariosRoot, folder, 'open-design.json');
      const skillPath = path.join(scenariosRoot, folder, 'SKILL.md');
      expect((await stat(manifestPath)).isFile()).toBe(true);
      expect((await stat(skillPath)).isFile()).toBe(true);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      expect(manifest.name).toBe(folder);
      expect(manifest.od.kind).toBe('scenario');
      expect(manifest.od.taskKind).toBe(expected.taskKind);
      const stageIds = manifest.od.pipeline.stages.map((s: { id: string }) => s.id);
      expect(stageIds).toEqual(expected.pipelineStages);
    });
  }
});
