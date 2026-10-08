import { getAllPlayers } from "@/lib/analytics";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";
  const country = req.nextUrl.searchParams.get("country") ?? "";
  const role = req.nextUrl.searchParams.get("role") ?? "";
  let list = await getAllPlayers();
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q));
  if (country) list = list.filter((p) => p.country === country);
  if (role) list = list.filter((p) => p.role === role);
  return Response.json({ players: list, count: list.length });
}
