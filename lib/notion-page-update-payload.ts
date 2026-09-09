/**
 * Notion rejects archive-state defaults on ordinary page updates. Archive is
 * therefore opt-in: omit it unless this request explicitly archives a page.
 */
export function buildNotionPageUpdatePayload(
  properties: Record<string, unknown>,
  options: { eraseContent?: boolean; archived?: true } = {}
) {
  return {
    properties,
    ...(options.eraseContent ? { erase_content: true } : {}),
    ...(options.archived === true ? { archived: true } : {})
  };
}
