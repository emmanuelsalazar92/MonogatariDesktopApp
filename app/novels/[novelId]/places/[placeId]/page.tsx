import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { placeBelongsToNovelForRoute } from "@/lib/db/studio";
import { isValidNovelRouteId, isValidPlaceRouteId } from "@/lib/studio-routes";

export default async function PlacePage({
  params
}: {
  params: Promise<{ novelId: string; placeId: string }>;
}) {
  const { novelId, placeId } = await params;
  if (
    !isValidNovelRouteId(novelId) ||
    !isValidPlaceRouteId(placeId) ||
    !(await placeBelongsToNovelForRoute(novelId, placeId))
  ) {
    notFound();
  }

  return <PrivateNovelStudioPage />;
}
