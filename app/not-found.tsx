"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isValidNovelRouteId } from "@/lib/studio-routes";

function recoveryNovelId(pathname: string) {
  const match = /^\/novels\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    const novelId = decodeURIComponent(match[1]);
    return isValidNovelRouteId(novelId) ? novelId : null;
  } catch {
    return null;
  }
}

export default function NotFound() {
  const novelId = recoveryNovelId(usePathname());
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="surface-panel max-w-md rounded-xl p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Not found</p>
        <h1 className="mt-3 text-2xl font-semibold">This novel or workspace does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No content was created or changed. Choose a safe place to continue.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {novelId ? (
            <>
              <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={`/novels/${encodeURIComponent(novelId)}`}>
                Current Novel
              </Link>
              <Link className="inline-flex min-h-10 items-center rounded-md border border-border/70 px-4 text-sm font-medium" href={`/novels/${encodeURIComponent(novelId)}/structure`}>
                Open Structure
              </Link>
            </>
          ) : (
            <Link className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href="/library">
              Open Library
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
