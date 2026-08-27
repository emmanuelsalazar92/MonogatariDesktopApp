import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { novelExistsForRoute } from "@/lib/db/studio";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export default async function NovelOverviewPage({ params }: { params: Promise<{ novelId: string }> }) {
  const { novelId } = await params;
  if (!isValidNovelRouteId(novelId) || !(await novelExistsForRoute(novelId))) notFound();

  return <PrivateNovelStudioPage />;
}
