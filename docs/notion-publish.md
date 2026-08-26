# Publish a novel to Notion

MD-10 publishes only the novel explicitly selected in Monogatari. It does not run automatically and SQLite remains the source of truth.

## Before publishing

1. Configure `NOTION_API_TOKEN` in `.env.local`.
2. In **Settings**, validate the Notion root page shared with the integration.
3. Open the intended novel in **Current Novel** and choose **Publish to Notion**.

## Published structure

```
Configured Notion root page
└── Novel
    ├── Characters
    ├── Planning
    └── Chapters
        ├── 01.01 — Chapter title
        └── 01.02 — Chapter title
```

Each chapter page serializes scene titles, summaries, paragraphs and dividers in Monogatari order. The numeric title prefix preserves that order in Notion.

## Repeat synchronization

Monogatari stores local-to-Notion page mappings in SQLite. A later publication updates mapped pages and their content instead of creating duplicate root, section, or chapter pages. If a mapped page was deleted in Notion, Monogatari creates a replacement and updates its mapping.

Archived volumes, chapters and scenes are not published. Removing a local chapter does not delete its existing Notion page; this keeps the initial synchronization non-destructive.
