import { isValidNovelRouteId } from "@/lib/studio-routes";

export type PlaceSceneSummary = {
  id: string; title: string; label: string;
  volumeId: string; chapterId: string;
  volumeOrder: number; chapterOrder: number; sceneOrder: number;
};
export function readScenePlaceChanges(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["novelId", "addSceneIds", "removeSceneIds"].includes(key))) return null;
  const valid = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 200 && ids.every((id) => typeof id === "string" && isValidNovelRouteId(id));
  if (!valid(input.addSceneIds) || !valid(input.removeSceneIds)) return null;
  const addSceneIds = [...new Set(input.addSceneIds)];
  const removeSceneIds = [...new Set(input.removeSceneIds)];
  if (addSceneIds.some((id) => removeSceneIds.includes(id))) return null;
  return { addSceneIds, removeSceneIds };
}
