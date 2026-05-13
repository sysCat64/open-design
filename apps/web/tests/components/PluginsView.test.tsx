// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord, PluginSourceKind, TrustTier } from '@open-design/contracts';
import { PluginsView } from '../../src/components/PluginsView';
import {
  applyPlugin,
  installPluginSource,
  listPluginMarketplaces,
  listPlugins,
  uploadPluginFolder,
  uploadPluginZip,
} from '../../src/state/projects';

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  applyPlugin: vi.fn(),
  installPluginSource: vi.fn(),
  listPluginMarketplaces: vi.fn(),
  listPlugins: vi.fn(),
  uninstallPlugin: vi.fn(),
  uploadPluginFolder: vi.fn(),
  uploadPluginZip: vi.fn(),
  upgradePlugin: vi.fn(),
}));

function makePlugin(
  id: string,
  sourceKind: PluginSourceKind,
  trust: TrustTier,
): InstalledPluginRecord {
  return {
    id,
    title: id === 'official-plugin' ? 'Official Plugin' : 'User Plugin',
    version: '1.0.0',
    sourceKind,
    source: '/tmp',
    trust,
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: id,
      version: '1.0.0',
      title: id,
      description: `${id} description`,
      od: {
        kind: 'scenario',
        mode: 'prototype',
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

const mockedListPlugins = vi.mocked(listPlugins);
const mockedListMarketplaces = vi.mocked(listPluginMarketplaces);
const mockedInstallPluginSource = vi.mocked(installPluginSource);
const mockedApplyPlugin = vi.mocked(applyPlugin);
const mockedUploadPluginFolder = vi.mocked(uploadPluginFolder);
const mockedUploadPluginZip = vi.mocked(uploadPluginZip);

beforeEach(() => {
  mockedListPlugins.mockResolvedValue([
    makePlugin('official-plugin', 'bundled', 'bundled'),
    makePlugin('user-plugin', 'github', 'restricted'),
  ]);
  mockedListMarketplaces.mockResolvedValue([
    {
      id: 'catalog-1',
      url: 'https://example.com/open-design-marketplace.json',
      trust: 'official',
      manifest: {
        name: 'Example Catalog',
        plugins: [{ name: 'remote-plugin', source: 'github:owner/repo' }],
      },
    },
  ]);
  mockedInstallPluginSource.mockResolvedValue({
    ok: true,
    plugin: makePlugin('new-plugin', 'github', 'restricted'),
    warnings: [],
    message: 'Installed New Plugin.',
    log: ['Parsing manifest'],
  });
  mockedUploadPluginZip.mockResolvedValue({
    ok: true,
    plugin: makePlugin('zip-plugin', 'user', 'restricted'),
    warnings: [],
    message: 'Installed Zip Plugin.',
    log: [],
  });
  mockedUploadPluginFolder.mockResolvedValue({
    ok: true,
    plugin: makePlugin('folder-plugin', 'user', 'restricted'),
    warnings: [],
    message: 'Installed Folder Plugin.',
    log: [],
  });
  mockedApplyPlugin.mockResolvedValue({
    query: 'Make something.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'restricted',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: 'snap-1',
      pluginId: 'official-plugin',
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'a'.repeat(64),
      inputs: {},
      resolvedContext: { items: [] },
      capabilitiesGranted: ['prompt:inject'],
      capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 0,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      status: 'fresh',
    },
    projectMetadata: {},
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PluginsView', () => {
  it('starts guided plugin creation from the Plugins hero', async () => {
    const onCreatePlugin = vi.fn();
    render(<PluginsView onCreatePlugin={onCreatePlugin} />);

    fireEvent.click(await screen.findByTestId('plugins-create-button'));

    expect(onCreatePlugin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Create or import a plugin' })).toBeNull();
  });

  it('groups official and user-installed plugins while keeping marketplaces coming soon', async () => {
    render(<PluginsView />);

    await waitFor(() => expect(screen.getAllByText('Official Plugin').length).toBeGreaterThan(0));
    expect(screen.queryByText('User Plugin')).toBeNull();

    const myPluginsTab = screen.getByTestId('plugins-tab-mine');
    const marketplacesTab = screen.getByTestId('plugins-tab-marketplaces');
    expect(myPluginsTab.getAttribute('aria-disabled')).toBeNull();
    expect(marketplacesTab.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(myPluginsTab);
    expect(screen.getAllByText('User Plugin').length).toBeGreaterThan(0);
    expect(screen.queryByText('Official Plugin')).toBeNull();
  });

  it('installs from a supported source string', async () => {
    render(<PluginsView />);

    expect(screen.queryByTestId('plugins-tab-import')).toBeNull();
    fireEvent.click(await screen.findByTestId('plugins-import-button'));
    expect(screen.getByRole('dialog', { name: 'Create or import a plugin' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('GitHub, archive, or marketplace source'), {
      target: { value: 'github:owner/repo/plugins/my-plugin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(mockedInstallPluginSource).toHaveBeenCalledWith(
        'github:owner/repo/plugins/my-plugin',
      ),
    );
    expect(await screen.findByText('Installed New Plugin.')).toBeTruthy();
    expect(screen.getByTestId('plugins-tab-mine').getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('User Plugin').length).toBeGreaterThan(0);
  });

  it('uploads zip and folder plugins from the import dialog', async () => {
    render(<PluginsView />);

    fireEvent.click(await screen.findByTestId('plugins-import-button'));
    fireEvent.click(screen.getByRole('button', { name: /upload zip/i }));
    const zip = new File(['zip-bytes'], 'plugin.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByTestId('plugins-zip-input'), {
      target: { files: [zip] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(mockedUploadPluginZip).toHaveBeenCalledWith(zip));
    expect(await screen.findByText('Installed Zip Plugin.')).toBeTruthy();

    fireEvent.click(await screen.findByTestId('plugins-import-button'));
    fireEvent.click(screen.getByRole('button', { name: /upload folder/i }));
    const folderFile = new File(['{}'], 'open-design.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('plugins-folder-input'), {
      target: { files: [folderFile] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(mockedUploadPluginFolder).toHaveBeenCalledWith([folderFile]));
    expect(await screen.findByText('Installed Folder Plugin.')).toBeTruthy();
  });
});
