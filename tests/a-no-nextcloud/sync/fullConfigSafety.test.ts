import { MirrorService } from '../../../src/sync/mirror/MirrorService';
import { ConflictResolver } from '../../../src/sync/ConflictResolver';
import { TransferService } from '../../../src/sync/transfer/TransferService';
import { ResolutionService } from '../../../src/sync/resolution/ResolutionService';
import { migrateFullConfigSync } from '../../../src/util/settingsMigration';
import { DEFAULT_SETTINGS } from '../../../src/types';

describe('Plus config transfers and conflicts', () => {
  const resolver = () => new ConflictResolver({} as never, {} as never, { ...DEFAULT_SETTINGS, configDir: '.obsidian' });
  it('chooses a complete newer plugin bundle even when JavaScript auto-merge is enabled', () => {
    const r = resolver();
    expect(r.strategyFor('.obsidian/plugins/other/main.js')).toBe('latest-mtime');
    expect(r.decide('.obsidian/plugins/other/main.js', '', 'local', 'remote',
      { localSize: 5, remoteSize: 6, localMtime: 1, remoteMtime: 2 })).toEqual({ action: 'prefer-remote' });
    expect(r.strategyFor('scripts/main.js')).toBe('merge');
  });
  it('also treats config markdown as a whole file rather than merging frontmatter', () => {
    expect(resolver().decide('.obsidian/plugins/other/cache.md', '', 'local', 'remote',
      { localSize: 5, remoteSize: 6, localMtime: 2, remoteMtime: 1 })).toEqual({ action: 'prefer-local' });
  });
  it('refuses excluded uploads and downloads at the transfer boundary', async () => {
    const own = '.obsidian/plugins/nextcloud-sync-plus/data.json';
    const stat = jest.fn(); const downloadFile = jest.fn(); const readBinary = jest.fn();
    const service = new TransferService({ isSystemExcluded: (p: string) => p === own,
      localAdapter: { stat, readBinary } } as never);
    await service.uploadFile({} as never, {} as never, own, '', '', 'sha256', {} as never, {} as never);
    await service.downloadFile({ downloadFile } as never, { path: own } as never, '', 'sha256', {} as never);
    expect(stat).not.toHaveBeenCalled(); expect(readBinary).not.toHaveBeenCalled(); expect(downloadFile).not.toHaveBeenCalled();
  });
  it('refuses manual push and pull of its own folder before any I/O', async () => {
    const service = new ResolutionService({ isSystemExcluded: (p: string) => p.startsWith('.obsidian/plugins/nextcloud-sync-plus/') } as never);
    await expect(service.pushLocalToRemote({} as never, '.obsidian/plugins/nextcloud-sync-plus/main.js')).rejects.toThrow('excluded');
    await expect(service.pullRemoteToLocal({} as never, '.obsidian/plugins/nextcloud-sync-plus/data.json')).rejects.toThrow('excluded');
  });

  it('mirror planning includes hidden content but never downloads Plus or deletes its parents', async () => {
    const own = '.obsidian/plugins/nextcloud-sync-plus';
    const service = new MirrorService({
      connect: async () => ({ getFiles: async () => [
        { path: `${own}/main.js`, checksum: null }, { path: '.obsidian/app.json', checksum: null },
      ] }),
      localScanner: { collectLocalStats: async () => undefined },
      enumerateIncludedConfigPaths: async () => ['.obsidian/workspace.json', `${own}/data.json`],
      enumerateIncludedConfigDirectories: async () => ['.obsidian', '.obsidian/plugins', own, '.obsidian/plugins/other/empty'],
      localAdapter: { stat: async () => ({ size: 1, mtime: 1 }) },
      remoteListing: { resolveRemoteChecksums: async () => undefined },
      app: { vault: { getAllFolders: () => [] } },
      isSystemExcluded: (p: string) => p === own || p.startsWith(`${own}/`),
      isProtectedDirectory: (p: string) => p === '.obsidian' || p === '.obsidian/plugins',
    } as never);
    const plan = await service.planRemoteMirror();
    expect(plan.downloads.map(f => f.path)).toEqual(['.obsidian/app.json']);
    expect(plan.deleteFiles).toEqual(['.obsidian/workspace.json']);
    expect(plan.deleteDirs).toEqual(['.obsidian/plugins/other/empty']);
  });

  it('enables full config scope once on upgrade and preserves later opt-outs', () => {
    const settings = { ...DEFAULT_SETTINGS, syncConfigFolder: false };
    expect(migrateFullConfigSync({ syncConfigFolder: false }, settings)).toBe(true);
    expect(settings.syncConfigFolder).toBe(true);
    expect(settings.configSyncRevision).toBe(1);
    settings.syncConfigFolder = false;
    expect(migrateFullConfigSync({ ...settings }, settings)).toBe(false);
    expect(settings.syncConfigFolder).toBe(false);
  });

});
