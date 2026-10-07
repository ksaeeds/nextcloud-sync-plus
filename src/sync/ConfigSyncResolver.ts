import { ConfigSyncCategories, DavSyncSettings } from '../types';
import { normalizePath } from 'obsidian';
import { isSyncTmpPath, LocalAdapter } from '../data/LocalAdapter';
import { isHardExcludedPath } from '../util/excludedFolders';

/** Legacy category definitions retained for compatibility; Plus no longer uses an allowlist. */
export const CORE_PLUGIN_CONFIG_FILES: readonly string[] = [
  'core-plugins.json',
  'core-plugins-migration.json',
  'graph.json',
  'daily-notes.json',
  'templates.json',
  'note-composer.json',
  'command-palette.json',
  'zk-prefixer.json',
  'random-note.json',
  'outgoing-links.json',
  'backlink.json',
  'page-preview.json',
  'file-recovery.json',
  'sync.json',
  'canvas.json',
  'switcher.json',
  'slash-command.json',
  'properties.json',
  'tag-pane.json',
  'outline.json',
  'word-count.json',
  'audio-recorder.json',
  'slides.json',
  'markdown-importer.json',
  'file-explorer.json',
  'global-search.json',
  'starred.json',
  'workspaces.json',
];

/** One config-sync category: a UI-facing label/description plus a pure path matcher. */
export interface ConfigSyncCategoryDescriptor {
  key: keyof ConfigSyncCategories;
  label: string;
  description: string;
  /** True when `rel` (a path relative to the config dir) belongs to this category. */
  matches(rel: string): boolean;
}

/** Legacy category descriptors; the complete-folder setting supersedes these. */
export const CONFIG_SYNC_CATEGORIES: readonly ConfigSyncCategoryDescriptor[] = [
  {
    key: 'bookmarks',
    label: 'Bookmarks',
    description: 'Obsidian bookmarks (bookmarks.json).',
    matches: (rel) => rel === 'bookmarks.json',
  },
  {
    key: 'others',
    label: 'Other settings (appearance, themes, hotkeys, core plugins)',
    description: 'Appearance & base settings (appearance.json, app.json), themes and CSS snippets (themes/, snippets/), hotkeys (hotkeys.json), and core-plugin settings (core-plugins.json, graph.json, etc.). A restart may be needed on the other device to apply core-plugin changes.',
    matches: (rel) =>
      rel === 'appearance.json' || rel === 'app.json'
      || rel.startsWith('themes/') || rel.startsWith('snippets/')
      || rel === 'hotkeys.json'
      || CORE_PLUGIN_CONFIG_FILES.includes(rel),
  },
];

export interface ConfigSyncResolverOptions {
  /** Vault#configDir, e.g. `.obsidian` (user-relocatable). All paths resolve against this. */
  configDir: string;
  /** Live settings reference (read on every call, so toggles take effect without a rebuild). */
  settings: Pick<DavSyncSettings, 'syncConfigFolder' | 'configSync'>;
  /**
   * This plugin's own directory (`<configDir>/plugins/<id>`), holding the sync-state DB and
   * data.json. A hard exclusion — never synced.
   */
  pluginDir: string;
  /** Used only by `enumerateIncludedPaths` to list/stat included files. */
  localAdapter: Pick<LocalAdapter, 'list' | 'stat'>;
}

/**
 * Single source of truth for "does this config-folder path sync, and which config paths should
 * be injected into the local scan". `SyncEngine.isSystemExcluded`, the remote-file filter, and
 * the remote-deletion scope guard all consult `isIncluded`, so exclusion (and the FR-008 safety
 * guarantee) is defined in exactly one place.
 */
export class ConfigSyncResolver {
  constructor(private readonly opts: ConfigSyncResolverOptions) {}

  /** Path relative to configDir, or null if `path` is not under (or equal to) the config dir. */
  private rel(path: string): string | null {
    const cd = this.opts.configDir;
    if (path === cd) return '';
    const prefix = `${cd}/`;
    if (!path.startsWith(prefix)) return null;
    return path.slice(prefix.length);
  }

  /** True if `path` is the config dir itself or anything under it. */
  isUnderConfigDir(path: string): boolean {
    return this.rel(path) !== null;
  }

  private isUnderPluginDir(path: string): boolean {
    const pd = normalizePath(this.opts.pluginDir).toLowerCase();
    const canonical = normalizePath(path).toLowerCase();
    return canonical === pd || canonical.startsWith(`${pd}/`);
  }

  /** Include config paths except this plugin's directory and hard exclusions. */
  isIncluded(path: string): boolean {
    if (!this.isUnderConfigDir(path) || !this.opts.settings.syncConfigFolder) return false;
    return !this.isUnderPluginDir(path) && !isHardExcludedPath(path) && !isSyncTmpPath(path);
  }

  /** The plugin directory and its ancestors must never be removed as a subtree. */
  isProtectedDirectory(path: string): boolean {
    const canonical = normalizePath(path).toLowerCase();
    return this.isUnderPluginDir(path) || normalizePath(this.opts.pluginDir).toLowerCase().startsWith(`${canonical}/`);
  }

  isConfigFolderConflictPath(path: string): boolean {
    return this.isUnderConfigDir(path) && this.isIncluded(path);
  }

  async enumerateIncludedPaths(): Promise<string[]> {
    return (await this.enumerate()).files;
  }

  async enumerateIncludedDirectories(): Promise<string[]> {
    return (await this.enumerate()).folders;
  }

  private async enumerate(): Promise<{ files: string[]; folders: string[] }> {
    const files = new Set<string>();
    const folders = new Set<string>();
    if (!this.opts.settings.syncConfigFolder) return { files: [], folders: [] };
    const visit = async (dir: string): Promise<void> => {
      if (!this.isIncluded(dir) || folders.has(dir)) return;
      folders.add(dir);
      // A failed read must abort the scan: interpreting it as an empty directory could delete
      // previously synced files on the server. A missing config directory is likewise an error.
      const listing = await this.opts.localAdapter.list(dir);
      for (const f of listing.files) if (this.isIncluded(f)) files.add(f);
      for (const sub of listing.folders) await visit(sub);
    };
    await visit(this.opts.configDir);
    return { files: [...files], folders: [...folders] };
  }
}
