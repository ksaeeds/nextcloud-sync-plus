import { ConfigSyncResolver } from '../../../src/sync/ConfigSyncResolver';
import { DEFAULT_SETTINGS } from '../../../src/types';

const cd = '.obsidian';
const own = `${cd}/plugins/nextcloud-sync-plus`;
function resolver(tree: Record<string, { files: string[]; folders: string[] }> = {}, on = true, configDir = cd) {
  const list = jest.fn(async (p: string) => tree[p] ?? { files: [], folders: [] });
  return { list, r: new ConfigSyncResolver({ configDir, pluginDir: `${configDir}/plugins/nextcloud-sync-plus`,
    settings: { ...DEFAULT_SETTINGS, syncConfigFolder: on, configSync: { bookmarks: false, others: false } },
    localAdapter: { list, stat: jest.fn() } }) };
}

describe('Plus complete config folder', () => {
  it('includes all configuration and other plugin paths, ignoring legacy category flags', () => {
    const { r } = resolver();
    for (const p of ['workspace.json', 'workspace-mobile.json', 'community-plugins.json', 'unknown.bin',
      'bookmarks.json', 'plugins/dataview/main.js', 'plugins/dataview/data.json', 'plugins/other/assets/.hidden']) {
      expect(r.isIncluded(`${cd}/${p}`)).toBe(true);
    }
    expect(r.isIncluded(cd)).toBe(true);
    expect(r.isIncluded(`${cd}/plugins`)).toBe(true);
    expect(r.isIncluded('Notes/a.md')).toBe(false);
    expect(r.isIncluded('.obsidian-backup/app.json')).toBe(false);
  });
  it('always excludes its own folder, nested state and code, even under alternate casing', () => {
    const { r } = resolver();
    for (const p of [own, `${own}/main.js`, `${own}/data.json`, `${own}/nested/state.json`, `${own.toUpperCase()}/data.json`]) {
      expect(r.isIncluded(p)).toBe(false);
    }
    expect(r.isIncluded(`${own}-other/main.js`)).toBe(true);
    expect(r.isIncluded(`${cd}/plugins/other/.abc.ncs.tmp`)).toBe(false);
  });
  it('protects the plugin folder and its ancestors from subtree deletion', () => {
    const { r } = resolver();
    for (const p of [cd, `${cd}/plugins`, own, `${own}/nested`]) expect(r.isProtectedDirectory(p)).toBe(true);
    expect(r.isProtectedDirectory(`${cd}/plugins/other`)).toBe(false);
  });
  it('respects the master switch and a relocated config directory', async () => {
    const { r } = resolver({}, false);
    expect(r.isIncluded(`${cd}/app.json`)).toBe(false);
    expect(await r.enumerateIncludedPaths()).toEqual([]);
    expect(await r.enumerateIncludedDirectories()).toEqual([]);
    const moved = resolver({}, true, '.config').r;
    expect(moved.isIncluded('.config/workspace.json')).toBe(true);
    expect(moved.isIncluded('.config/plugins/nextcloud-sync-plus/data.json')).toBe(false);
    expect(moved.isIncluded(`${cd}/app.json`)).toBe(false);
  });
  it('recursively discovers files, assets, hidden content and empty folders without reading itself', async () => {
    const { r, list } = resolver({
      [cd]: { files: [`${cd}/workspace.json`], folders: [`${cd}/plugins`, `${cd}/empty`] },
      [`${cd}/plugins`]: { files: [], folders: [own, `${cd}/plugins/other`] },
      [`${cd}/plugins/other`]: { files: [`${cd}/plugins/other/main.js`], folders: [`${cd}/plugins/other/.assets`] },
      [`${cd}/plugins/other/.assets`]: { files: [`${cd}/plugins/other/.assets/pic.bin`], folders: [] },
      [own]: { files: [`${own}/data.json`], folders: [] },
    });
    expect(await r.enumerateIncludedPaths()).toEqual([`${cd}/workspace.json`, `${cd}/plugins/other/main.js`, `${cd}/plugins/other/.assets/pic.bin`]);
    expect(await r.enumerateIncludedDirectories()).toContain(`${cd}/empty`);
    expect(list).not.toHaveBeenCalledWith(own);
  });
  it('aborts on an unreadable directory rather than treating it as remotely deletable missing content', async () => {
    const { r, list } = resolver();
    list.mockRejectedValueOnce(new Error('Read failed'));
    await expect(r.enumerateIncludedPaths()).rejects.toThrow('Read failed');
  });
});
