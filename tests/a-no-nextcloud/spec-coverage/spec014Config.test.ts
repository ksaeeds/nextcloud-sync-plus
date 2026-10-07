// Spec-conformance: 014-obsidian-config-sync (defaults & migration; pure).
// Category inclusion / hard exclusions are covered by ConfigSyncResolver.test and
// e2e CG-1..10; here we assert the master default and the bookmarks migration.
import { DEFAULT_SETTINGS } from '../../../src/types';
import { migrateBookmarksToConfigSync } from '../../../src/util/settingsMigration';

describe('spec 014 — config folder sync (defaults & migration)', () => {
  it('FR-001: master "sync config folder" defaults ON', () => {
    expect(DEFAULT_SETTINGS.syncConfigFolder).toBe(true);
  });

  it('FR-011: legacy syncBookmarks=true → master ON + ONLY Bookmarks category', () => {
    const s = { ...DEFAULT_SETTINGS, configSync: { ...DEFAULT_SETTINGS.configSync } };
    migrateBookmarksToConfigSync({ syncBookmarks: true }, s);
    expect(s.syncConfigFolder).toBe(true);
    expect(s.configSync).toEqual({ bookmarks: true, others: false });
  });

  it('FR-011: legacy syncBookmarks=false uses the Plus full-config default', () => {
    const s = { ...DEFAULT_SETTINGS, configSync: { ...DEFAULT_SETTINGS.configSync } };
    migrateBookmarksToConfigSync({ syncBookmarks: false }, s);
    expect(s.syncConfigFolder).toBe(true);
  });

  it('FR-012: idempotent — once syncConfigFolder is persisted, no re-migration', () => {
    const s = { ...DEFAULT_SETTINGS, syncConfigFolder: false, configSync: { ...DEFAULT_SETTINGS.configSync } };
    migrateBookmarksToConfigSync({ syncBookmarks: true, syncConfigFolder: false }, s);
    expect(s.syncConfigFolder).toBe(false); // not re-migrated
  });
});
