import { getLiveFeed } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const feed = await getLiveFeed();
    return Response.json(feed, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message, matches: [], source: "simulated" }, { status: 500 });
  }
}
