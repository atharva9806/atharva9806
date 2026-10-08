import { getAllPlayers } from "@/lib/analytics";
import PlayersTable from "./PlayersTable";
import { SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getAllPlayers();
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <SectionTitle eyebrow="Players" title="The complete database." sub="Search, filter and sort across formats. Click any player for a full career breakdown, strengths & weaknesses and a strategy plan." />
      <PlayersTable players={players} />
    </div>
  );
}
