import { notFound } from "next/navigation";
import PrivateNovelStudioPage from "@/app/page";
import { timelineEventBelongsToNovelForRoute } from "@/lib/db/timeline-places";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export default async function TimelineEventPage({ params }: { params: Promise<{ novelId: string; eventId: string }> }) {
  const { novelId, eventId } = await params;
  if (!isValidNovelRouteId(novelId) || !isValidNovelRouteId(eventId) || !(await timelineEventBelongsToNovelForRoute(novelId, eventId))) {
    notFound();
  }
  return <PrivateNovelStudioPage />;
}
