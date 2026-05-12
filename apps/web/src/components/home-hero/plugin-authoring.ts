export interface HomePromptHandoff {
  id: number;
  prompt: string;
  focus: boolean;
  source: 'plugin-authoring';
}

export const PLUGIN_AUTHORING_PROMPT = [
  'Create an Open Design plugin for: <describe the workflow you want to package>.',
  '',
  'Follow docs/plugins-spec.md and produce a folder named generated-plugin with:',
  '- SKILL.md describing the agent behavior and workflow',
  '- open-design.json with valid metadata, mode, task kind, inputs, and any pipeline/context references',
  '- optional examples/ and assets/ when useful',
  '',
  'When finished, summarize the files created and whether the folder is ready to add to My plugins.',
].join('\n');

export function buildPluginAuthoringPrompt(goal: string): string {
  return [
    `Create an Open Design plugin for: ${goal}`,
    '',
    'Follow docs/plugins-spec.md and produce a folder named generated-plugin with:',
    '- SKILL.md describing the agent behavior and workflow',
    '- open-design.json with valid metadata, mode, task kind, inputs, and any pipeline/context references',
    '- optional examples/ and assets/ when useful',
    '',
    'When finished, summarize the files created and whether the folder is ready to add to My plugins.',
  ].join('\n');
}

export function createPluginAuthoringHandoff(
  id: number,
  prompt = PLUGIN_AUTHORING_PROMPT,
): HomePromptHandoff {
  return {
    id,
    prompt,
    focus: true,
    source: 'plugin-authoring',
  };
}
