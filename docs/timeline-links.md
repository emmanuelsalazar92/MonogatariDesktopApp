# Timeline entity associations

`TimelineEventCharacter(eventId, characterId)` and `TimelineEventPlace(eventId, locationId)` are the canonical many-to-many joins. Each has a composite primary key and an index on its entity ID. Deleting a join never deletes either entity. Event deletion cascades only its join rows; referenced Characters and Places use RESTRICT.

The API exposes `characterIds` and `locationIds` as arrays derived from joins. No names or private entity fields are copied into events. Timeline filters use IDs and labels/navigation resolve current scoped Character/Place metadata. Location Bible derives Story Events and event counts from exactly the same Event–Place join.

Event create/edit validates all IDs against the event's Novel and changes metadata plus both join sets in one SQLite write transaction. Full edits require `positionRevision`. The Place-side endpoint `/api/timeline-events/{eventId}/place` accepts `{ locationId, linked, expectedLinked }`; it changes only that pair and increments the event revision, preserving other Places and Characters. Old single-link mutation bodies are rejected instead of silently overwriting a multi-place set. Legacy create input `locationId` is translated only when unambiguous; new clients send `locationIds`.

## Upgrade

Stop the app and back up SQLite. Run `npm run db:migrate-timeline-links` before `db:push`/starting the new client, after the existing Timeline position migration if still pending. `setup:dev` runs both before schema push. Then generate the Prisma client as usual.

The additive, immediate-transaction migration copies unique, existing, same-novel IDs from the previous JSON and Place FK. Malformed, missing or cross-novel values are skipped and reported only as counts, never private text. Legacy columns remain on disk for recovery but are ignored by Prisma and never consulted at runtime. A completion marker prevents reruns from resurrecting associations intentionally removed after migration. Fresh seed data writes joins directly. No GET performs migrations.
