import { notFound } from "next/navigation";
import { getNotionSyncCenter } from "@/lib/notion-sync-center";
import { NotionSyncCenter } from "@/components/studio/notion-sync-center";

export const dynamic = "force-dynamic";

export default async function NotionSyncCenterPage({ params }: { params: Promise<{ novelId: string }> }) {
  const { novelId } = await params;
  const report = await getNotionSyncCenter(novelId);
  if (!report?.connected) notFound();
  return <NotionSyncCenter initial={report} />;
}
