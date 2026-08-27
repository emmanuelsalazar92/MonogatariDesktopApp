import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { novelExistsForRoute } from "@/lib/db/studio";
import { isNovelWorkspaceSection, isValidNovelRouteId } from "@/lib/studio-routes";

export default async function NovelWorkspacePage({
  params
}: {
  params: Promise<{ novelId: string; section: string }>;
}) {
  const { novelId, section } = await params;
  if (
    !isValidNovelRouteId(novelId) ||
    !isNovelWorkspaceSection(section) ||
    !(await novelExistsForRoute(novelId))
  ) {
    notFound();
  }

  return <PrivateNovelStudioPage />;
}
