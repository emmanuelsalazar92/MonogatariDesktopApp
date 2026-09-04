import Link from "next/link";
import { timelineStoryTarget } from "@/lib/timeline-navigation";
import type { TimelineEventSummary } from "@/lib/studio-domain";
import type { RelationshipSinceOption } from "@/lib/relationship-since";

export function TimelineStoryLink({ event, novelId, options }: { event: TimelineEventSummary; novelId: string; options: RelationshipSinceOption[] }) {
  const target = timelineStoryTarget(event, novelId, options);
  return target ? <Link href={target.href} className="text-sm text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{target.action}: {target.label}</Link>
    : <p className="text-sm text-muted-foreground">{event.sceneId || event.chapterId || event.volumeId ? "Story Position unavailable or archived" : "Not told in Structure"}</p>;
}
