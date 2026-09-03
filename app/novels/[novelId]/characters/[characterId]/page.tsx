import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { characterBelongsToNovelForRoute } from "@/lib/db/studio";
import { isValidCharacterRouteId, isValidNovelRouteId } from "@/lib/studio-routes";

export default async function CharacterPage({
  params
}: {
  params: Promise<{ novelId: string; characterId: string }>;
}) {
  const { novelId, characterId } = await params;
  if (
    !isValidNovelRouteId(novelId) ||
    !isValidCharacterRouteId(characterId) ||
    !(await characterBelongsToNovelForRoute(novelId, characterId))
  ) {
    notFound();
  }

  return <PrivateNovelStudioPage />;
}
