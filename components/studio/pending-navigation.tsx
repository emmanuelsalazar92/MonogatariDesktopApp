"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

/**
 * Shared guard for a route change that may include a save or document read
 * before Next receives the navigation. It intentionally has no timer: fast
 * navigations disappear with the route, while slow ones communicate progress
 * immediately and reject repeat activation.
 */
export function usePendingNavigation() {
  const [label, setLabel] = React.useState<string | null>(null);
  const pendingRef = React.useRef(false);

  const begin = React.useCallback((nextLabel: string) => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setLabel(nextLabel);
    return true;
  }, []);
  const finish = React.useCallback(() => {
    pendingRef.current = false;
    setLabel(null);
  }, []);

  return { isPending: label !== null, label, begin, finish };
}

export function NavigationFeedback({ label }: { label: string | null }) {
  if (!label) return null;
  return <p className="navigation-feedback fixed right-4 top-4 z-[60] inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-paper" role="status" aria-live="polite" aria-atomic="true">
    <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
    <span>{label}</span>
  </p>;
}
