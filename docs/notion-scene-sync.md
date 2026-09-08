# Scene-level Notion synchronization

Each active local scene is represented by one Notion page beneath its chapter
container. Its `NotionMapping` is keyed by `scene:<Scene.id>`, never by title
or position. The mapping stores the Notion page id, local revision/content
cursor, sync time, remote edit cursor, and remote archive cursor.

The publisher creates an unmapped scene page and commits its mapping
immediately after Notion returns its id. A mapped scene is rewritten only when
its revision or serialized scene snapshot differs from that mapping's cursor.
Consequently a rename, reorder, or move changes only that scene page title;
unchanged manuscript bodies are not read or rewritten. Page titles include the
current volume/chapter/scene number for navigation, but are presentation only.

Chapter pages are containers. Existing connected novels are migrated lazily:
the next successful local sync clears the old aggregate chapter body once and
creates child pages for every scene. This is intentionally local-canonical for
that one migration pass; users should pull/review legacy chapter-page edits
before migrating. Thereafter content comparisons are scene-level.

Archive or local deletion archives the mapped Notion page rather than deleting
it. Restoring a scene reuses its mapping and unarchives that same page. A move
keeps the page identity and updates its numbered title; Notion's page-parent
API does not support a safe atomic reparent, so the existing page remains in
its original chapter container until an explicit future reparent operation is
available.

Failures are per-page durable: successfully mapped scenes retain their cursor,
while the failing scene and untouched later scenes remain pending. Retrying
therefore skips completed scenes. The durable mapping is written immediately
after page creation, which makes retries idempotent except for a process loss
in the narrow interval between Notion accepting a create and SQLite committing
the returned id; that case is surfaced as a recoverable sync error rather than
marking the scene synchronized.
