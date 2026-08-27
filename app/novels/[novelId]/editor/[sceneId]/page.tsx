import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { sceneBelongsToNovelForRoute } from "@/lib/db/studio";
import { isValidNovelRouteId, isValidSceneRouteId } from "@/lib/studio-routes";

export default async function SceneEditorPage({
  params
}: {
  params: Promise<{ novelId: string; sceneId: string }>;
}) {
  const { novelId, sceneId } = await params;
  if (
    !isValidNovelRouteId(novelId) ||
    !isValidSceneRouteId(sceneId) ||
    !(await sceneBelongsToNovelForRoute(novelId, sceneId))
  ) {
    notFound();
  }

  return <PrivateNovelStudioPage />;
}
