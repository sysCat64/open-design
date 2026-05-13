# Open Design Plugins

This directory has two different jobs:

- `_official/` - first-party plugins bundled with Open Design. The daemon scans this tree at startup and registers these plugins as official.
- `community/` - the public authoring kit for people and agents who want to build plugins, test them, publish them, or open a PR back to Open Design.

The common contract is the same everywhere: a plugin is a portable agent skill folder with a `SKILL.md`, plus an optional `open-design.json` sidecar that gives Open Design marketplace metadata, inputs, previews, pipelines, and trust/capability hints.

Start here:

- Community authoring kit: [`community/README.md`](community/README.md)
- Community plugin spec: [`community/SPEC.md`](community/SPEC.md)
- Agent handoff guide: [`community/AGENT-DEVELOPMENT.md`](community/AGENT-DEVELOPMENT.md)
- Full product spec: [`../docs/plugins-spec.md`](../docs/plugins-spec.md)
- Manifest schema: [`../docs/schemas/open-design.plugin.v1.json`](../docs/schemas/open-design.plugin.v1.json)

