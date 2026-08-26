# Configurable Notion autosync

MD-26 adds an opt-in scheduler for Notion. The settings persist `notionAutosyncEnabled` and a 1, 2, 5, 10, 15, or 30 minute interval. Each interval is a safety check for pending work, not a debounce and never a call per keystroke.

## Safety behavior

- The scheduler uses one re-scheduled timer, so suspension or a hidden tab cannot accumulate missed runs. Returning to a visible tab evaluates at most once and starts a fresh interval.
- It does nothing when the active novel is clean, Notion is not configured, autosync is disabled, or a same-novel sync is already active.
- Before an automatic push, the server compares synchronized chapter pages with the last known remote baselines. A remote change stops the push and surfaces **Remote changes detected** so the MD-12/MD-13 pull and conflict flow can be used.
- Every local change increments a persistent revision. A sync only clears `isDirty` if the revision captured at the start is still current at completion; edits made while Notion is working remain pending.
- Errors keep the local data and the pending state intact. Automatic retries use a bounded backoff of up to 30 minutes; rate-limit responses keep the existing `Retry-After` retry behavior. Manual sync remains available and shares the same server-side concurrency lock and remote-change protection.

## UI

Settings exposes the enable switch and interval without requiring a restart. The novel overview has a non-blocking status for syncing, synced, error, or remote changes, along with the last successful synchronization time.
