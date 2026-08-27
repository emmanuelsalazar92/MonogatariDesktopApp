import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="surface-panel max-w-md rounded-xl p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Not found</p>
        <h1 className="mt-3 text-2xl font-semibold">This novel or workspace does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No content was created or changed. Return to your library to choose an existing novel.
        </p>
        <Link className="mt-6 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href="/library">
          Open Library
        </Link>
      </section>
    </main>
  );
}
