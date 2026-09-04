import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { noteBelongsToNovelForRoute } from "@/lib/db/notes";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export default async function NotePage({ params }: { params: Promise<{ novelId: string; noteId: string }> }) {
  const { novelId, noteId } = await params;
  if (!isValidNovelRouteId(novelId) || !isValidNovelRouteId(noteId) || !(await noteBelongsToNovelForRoute(novelId, noteId))) notFound();
  return <PrivateNovelStudioPage />;
}
