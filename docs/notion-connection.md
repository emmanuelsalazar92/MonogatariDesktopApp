# Private Notion connection

Monogatari can validate access to one Notion root page while keeping SQLite as the source of truth.

1. Create or select a private/internal integration in Notion.
2. Copy `.env.example` to `.env.local` and set `NOTION_API_TOKEN` to the integration secret.
3. In Notion, share only the intended Monogatari root page with that integration.
4. Restart Monogatari, open **Settings**, paste the root page URL or ID, and select **Test Notion connection**.

The token is read only by the server route and is never stored in SQLite, returned by the API, or exposed through a `NEXT_PUBLIC_*` variable. The root page ID is saved locally only after Notion confirms that the integration can access it. Monogatari continues to operate normally when Notion is not configured or is unavailable.
