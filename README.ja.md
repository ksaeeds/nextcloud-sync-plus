# Nextcloud Sync Plus

Please see [README.md](README.md) for the current Plus behavior and BRAT installation instructions.

The original Japanese documentation for upstream 1.0.8 is available at https://github.com/siosig/obsidian-nextcloudsync/blob/1.0.8/README.ja.md. Plus 1.0.10 extends that version with complete config-folder synchronization excluding itself.

## Settings defaults / 設定の既定値

| Setting | Desktop | Mobile |
|---|---|---|
| Complete config folder sync, excluding Plus | on | on |
| Network timeout | 30 seconds | 30 seconds |
| Startup sync delay | 1 second | 1 second |
| Maximum file size | unlimited | 20 MB |
| Network concurrency | derived from memory, up to 16 | derived from memory |

Existing Plus installations enable complete config syncing once when upgrading to 1.0.10. Subsequent manual opt-outs are preserved. See the English README for all current defaults.
