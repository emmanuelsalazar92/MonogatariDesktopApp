# Timeline: chronological position vs. story position

`TimelineEvent` remains the canonical entity. Chronological order is `(sortIndex ASC, id ASC)` within a novel. Labels, relative dates, chapter order and scene order never enter this comparison.

## Chronological position

- `sortIndex`: integer from -1,000,000,000 to 1,000,000,000. Always authoritative, including events with relative time. Equal indices represent simultaneous/unordered events; ID breaks ties deterministically. Authors can insert between indices (e.g. 1024, **1536**, 2048), or explicitly choose equal indices. No fractional indexing or calendar inference.
- Creation without an index appends at the current maximum + 1024, inside the same SQLite write transaction. An exhausted range returns a conflict asking for a manual index; it never wraps or silently renumbers events.
- `internalDate`: retained physical/API name for the optional display label (max 200 characters). UI calls it **Display label**. It is not parsed and has no ordering semantics. There is no duplicate display-label column.
- `chronologyKind`: `manual` (default; unknown date) or `relative`. Relative mode requires integer `relativeDay` in the same bounded range and optionally `relativeMinute` (0–1439). Negative days are valid. Manual mode requires both relative fields to be null. Relative coordinates provide context, not an automatic sort override.
- Exact calendars and eras are intentionally not implemented in this version. Every event can use manual chronology without fabricating a date.
- `positionRevision`: incremented on position edits; stale edits return 409.

## Story position

Optional `volumeId`, `chapterId`, `sceneId` reference Structure, independent of chronology. The most specific ID is the target. On write, ancestors are derived and supplied ancestors must agree. All targets must belong to the event's novel; mismatched or missing targets reject the entire transaction. An event with no Structure target is valid. UI labels are derived from current Structure metadata, including renamed chapters/scenes.

`PATCH /api/timeline-events/{eventId}/position?novelId=...` accepts the complete position plus `positionRevision`. It edits only position fields. Title, description, characters and Place associations remain untouched. Body fields are allowlisted, mutation origin is checked, and scope/revision/Structure checks run inside the SQLite write transaction. GET does not migrate or reorder data.

## Existing databases

Stop the app and back up the SQLite database, then run `npm run db:migrate-timeline-position` **before** `db:push` or starting the new client. Run `npm run db:generate` after updating the schema.

The existing `setup:dev` workflow also performs this migration before its schema push; it skips the migration for a new empty database without TimelineEvent.

The additive migration runs in an immediate transaction. On first addition of `sortIndex`, it assigns spaced indices per novel using the previous display-label ordering (numeric English collation, then ID), solely to preserve the former visible ordering. It preserves every label verbatim, all event bodies and all Structure/Place associations, and does not infer calendar dates. All migrated events use manual mode. Rerunning it preserves author-assigned indices. An already-upgraded schema is never guessed to be legacy or silently reordered.

New schemas use Prisma defaults; seed fixtures supply explicit indices. No migration runs on read requests. Tests use isolated SQLite databases; migration of a personal database is an explicit operational step.
