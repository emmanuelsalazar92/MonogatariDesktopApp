import type { StructureItemType } from "@/lib/db/structure";

export type StructureTitleSearchItem = {
  type: StructureItemType;
  id: string;
  title: string;
};

export function normalizeStructureSearchQuery(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function searchStructureTitles(
  items: readonly StructureTitleSearchItem[],
  query: string,
  limit = 30
) {
  const normalizedQuery = normalizeStructureSearchQuery(query);
  if (!normalizedQuery) return [];

  return items.filter((item) => normalizeStructureSearchQuery(item.title).includes(normalizedQuery)).slice(0, limit);
}
