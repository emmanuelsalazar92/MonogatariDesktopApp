# Library hardening validation

Date: 2026-09-06

## Manual and visual checks

The checks below used the local Library route with five persisted projects, including
the active novel and local Notion sync summaries. Browser console diagnostics were
empty during the run.

| Surface | Viewport / condition | Result |
| --- | --- | --- |
| Wide desktop | 1440 × 900 | The grid presents two wide cards per row; filters and actions stay legible. |
| Laptop | 1024 × 768 | Metadata and actions reflow without horizontal page overflow. |
| Narrow | 375 × 812 | Filters stack, cards stay single-column, and primary plus overflow actions remain reachable. `scrollWidth` matched the client width (366 px). |
| Zoom | 720 px CSS viewport, equivalent to 200% zoom from a 1440 px layout | Filters and card content remain usable; `scrollWidth` matched the client width (710 px). |
| List | 375 px | The list preserves the title, narrative state, Current/Notion status, Continue writing, and the contextual menu while reducing secondary metadata. |

Keyboard checks:

- The card menu opens from its labelled trigger.
- `ArrowDown` moves focus to the first menu item.
- `Escape` closes the menu and returns focus to that trigger.
- Current, lifecycle, and Notion states expose text labels in the accessibility tree; the Notion summary also exposes its last successful sync as supplementary help text.

## Automated evidence

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `node --test tests/novel-project-card.test.mjs tests/novel-lifecycle.test.mjs tests/library-query.test.mjs tests/dashboard-shortcuts.test.mjs`
- `git diff --check`

All commands completed successfully. The Library query test exercises 1, 3, 20,
and 100 projects and recorded approximately 9.5 ms for 1,000 filter passes over
the 100-project fixture. The Library snapshot requests metadata-only data on the
Library surface; it excludes scene body content and reads locally persisted Notion
state rather than making one remote request per card.

## Scope notes

- The visual system was checked only in the canonical fixed palette. Light/dark
  selection is intentionally outside this scope.
- The run did not archive, restore, sync, export, or otherwise mutate novel
  lifecycle or Notion state. It returned the temporary Grid/List preference to
  Grid after exercising the List layout.
