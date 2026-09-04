import type { TimelineEventSummary } from "./studio-domain";
import { compareChronology, validTimelineOrder } from "./timeline-position";
import { isValidNovelRouteId } from "./studio-routes";

// sortIndex is authoritative. Equal indices share a group; ID orders their presentation,
// not their fictional time. Labels never merge distant positions or change ordering.
export function chronologicalGroups(events: TimelineEventSummary[], novelId: string, showSpoilers = false) {
  const visible = events.filter(event => event.novelId === novelId && isValidNovelRouteId(event.id) && (showSpoilers || !event.isSpoiler)).sort(compareChronology);
  const groups: { key: string; label: string; events: TimelineEventSummary[] }[] = [];
  for (const event of visible) {
    const key = validTimelineOrder(event.sortIndex) ? String(event.sortIndex) : `unknown:${event.id}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: validTimelineOrder(event.sortIndex) ? `Position ${event.sortIndex}` : "Position unavailable", events: [] };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

export function chronologyLabel(event: TimelineEventSummary) {
  if (event.internalDate) return event.internalDate;
  if (event.chronologyKind === "relative" && event.relativeDay !== null) {
    const time = event.relativeMinute === null ? "" : ` · ${String(Math.floor(event.relativeMinute / 60)).padStart(2, "0")}:${String(event.relativeMinute % 60).padStart(2, "0")}`;
    return `Day ${event.relativeDay}${time}`;
  }
  return "No date specified";
}
