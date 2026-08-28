import { NextResponse } from "next/server";
import { getReaderDocument } from "@/lib/db/studio";
import type { ReaderScope } from "@/lib/reader-document";

const scopes = new Set<ReaderScope>(["scene", "chapter", "volume", "novel"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const novelId = searchParams.get("novelId") || "";
  const targetId = searchParams.get("targetId") || "";
  const scope = searchParams.get("scope") as ReaderScope;
  if (!novelId || !targetId || !scopes.has(scope)) return NextResponse.json({ error: "invalid reader request" }, { status: 400 });
  const document = await getReaderDocument(novelId, scope, targetId);
  if (!document) return NextResponse.json({ error: "reader target not found" }, { status: 404 });
  return NextResponse.json(document);
}
