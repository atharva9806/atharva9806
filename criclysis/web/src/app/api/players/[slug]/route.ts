import { getPlayerBySlug } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const player = await getPlayerBySlug(slug);
  if (!player) return Response.json({ error: "Player not found" }, { status: 404 });
  return Response.json(player);
}
