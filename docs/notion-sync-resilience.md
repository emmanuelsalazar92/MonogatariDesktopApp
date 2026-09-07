# Notion sync resilience

`NotionSyncState` is the sole operational record for a novel sync. The frontend
only reads it through the Studio snapshot; it never treats a successful HTTP
response as proof that the current local revision is synchronized.

## Operation lifecycle

1. The server atomically records `syncing`, an opaque operation identifier, the
   current revision as `syncSnapshotRevision`, and a 30-minute lease.
2. A concurrent request for that novel reuses the existing operation instead of
   issuing another Notion publish request.
3. The worker refreshes its lease around remote work. Completion is accepted only
   when the stored operation identifier and snapshot still match.
4. Completion records `lastSyncedRevision` and `lastNotionSync`. If local writes
   advanced the revision in the meantime, `isDirty` remains true, so the UI shows
   **Changes pending**, not **Synced**.

The operation identifier stays server-side and is never an authorization token or
part of the Studio snapshot.

## Reload, restart, and recovery

Reloading fetches the local Studio snapshot. An active, valid lease therefore
renders **Syncing** again without starting pull or push work. A short local UI
poll while the canonical state is `syncing` refreshes that same snapshot only.

If a persisted `syncing` record outlives its lease, the server changes it to a
recoverable error and keeps the project dirty. This intentionally conservative
recovery never assumes remote success, removes no SQLite content, mappings, or
backups, and does not make a remote mutation. A later retry first uses the
existing remote-change protection, so an ambiguous previous completion cannot be
used to overwrite local work blindly.
