# Resolve Notion conflicts

MD-13 adds an explicit conflict-resolution flow on top of the safe pull introduced in MD-12. When both a local chapter and its synchronized Notion page changed from the same baseline, Monogatari blocks the automatic pull and opens a comparison dialog.

## Author choices

- **Keep local**: acknowledges the remote version and force-syncs the local novel back to Notion.
- **Accept Notion**: creates a physical SQLite recovery snapshot in `prisma/backups` before replacing the affected local chapter, then recalculates word counts.
- **Cancel**: keeps local content unchanged and records the currently compared versions, preventing the same unchanged conflict from appearing indefinitely.

Every resolution re-fetches and verifies the conflict on the server before changing data. If either side changed again, the resolution returns a conflict rather than applying a stale browser preview.
