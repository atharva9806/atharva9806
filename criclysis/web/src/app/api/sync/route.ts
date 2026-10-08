import { db } from "@/db";
import { syncLog } from "@/db/schema";
import { getLiveFeed } from "@/lib/live";
import { ensureSeeded } from "@/lib/seed";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Forces a refresh from external sources (CricAPI / ESPNcricinfo feed) and reports the ingestion log.
export async function POST() {
  await ensureSeeded();
  const feed = await getLiveFeed(true);
  const log = await db.select().from(syncLog).orderBy(desc(syncLog.createdAt)).limit(10);
  return Response.json({ ok: true, source: feed.source, matches: feed.matches.length, log });
}

export async function GET() {
  const log = await db.select().from(syncLog).orderBy(desc(syncLog.createdAt)).limit(10);
  return Response.json({ log });
}
