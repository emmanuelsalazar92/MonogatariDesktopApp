# Notion synchronization scope

Monogatari synchronizes a connected novel through its generated Notion page tree.

## Bidirectional, conflict-aware scope

Chapter titles and ordered scene titles, summaries, and manuscript content are compared per chapter against the persisted last-successful local and Notion snapshots. A normal sync pulls a Notion-only chapter change, then publishes independent local changes. If both representations of the same chapter changed, it requires an explicit choice of the local or Notion version.

The current remote structure must contain the same ordered scenes as the mapped local chapter. Missing, extra, incomplete, or destructive-empty remote content is reported for review; it is never inferred as a deletion.

## One-way published scope

Novel metadata, volume/planning details, and characters are published to the generated Notion pages. They are not imported or reconciled from Notion.

Places, notes, timeline events, relationships, remote-created chapters/scenes, reordering, and remote deletions are outside the bidirectional scope. Their Notion changes are not silently applied.
