# Controlled Notion sync

MD-11 keeps local SQLite persistence and Notion synchronization independent. Saving a scene, creating a character, or changing the story structure first completes locally and marks that novel as pending for Notion; it never calls Notion from a keystroke.

## Manual sync

Open the selected novel overview and use **Sync with Notion**. The status area reports **Local saved**, **Syncing Notion**, **Synced**, or **Sync error**. A successful response records `lastNotionSync` and clears the pending flag in SQLite. A failed Notion request leaves the local content intact and pending for a later retry.

## Request control

- Clean novels return without writes unless the user explicitly uses the manual button.
- Syncs for the same novel share one in-flight request, so two browser actions cannot publish concurrently.
- HTTP 429 reads Notion's `Retry-After` value and retries once after that delay.
- `NotionSyncState` persists the pending state and the last successful sync per novel, so it survives a browser refresh.
