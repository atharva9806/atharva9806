import { buildTeamStrategy, getPlayerBySlug } from "@/lib/analytics";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const player = sp.get("player");
  if (player) {
    const p = await getPlayerBySlug(player);
    if (!p) return Response.json({ error: "Player not found" }, { status: 404 });
    return Response.json({ type: "player", player: p.name, strategy: p.strategy });
  }
  const team = sp.get("team") ?? "India";
  const opponent = sp.get("opponent") ?? "Australia";
  const s = await buildTeamStrategy(team, opponent);
  return Response.json({ type: "team", ...s });
}
