# Pull changes from Notion

MD-12 lets an author request updates from synchronized Notion chapter pages without treating Notion as the source of truth. The **Update from Notion** action checks every synchronized chapter in the selected novel before modifying SQLite. The API also accepts an optional `chapterId` for a single chapter pull.

## Safe comparison

After an outbound Notion sync, Monogatari stores a baseline for each chapter with the local scene representation and the Notion block representation. During a pull:

- only Notion changed: the remote scene titles and content are applied in one SQLite transaction;
- only local changed: the local draft is preserved;
- both changed: the endpoint returns HTTP 409 with conflict details and applies nothing;
- there is no baseline, the scene structure changed, or Notion no longer contains scene headings: the endpoint stops for manual review.

Applying remote content recalculates every affected chapter and novel word count. Notion outages and rejected requests occur before the write transaction, so the studio remains usable with its existing local data.
