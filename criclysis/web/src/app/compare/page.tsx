import { Suspense } from "react";
import { getAllPlayers } from "@/lib/analytics";
import { SectionTitle } from "@/components/ui";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const players = await getAllPlayers();
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <SectionTitle eyebrow="Compare" title="Head to head." sub="Overlay two players across eight attributes and every format." />
      <Suspense fallback={<div className="card p-10 text-center text-sm text-[#6e6e73]">Loading…</div>}>
        <CompareClient players={players} />
      </Suspense>
    </div>
  );
}
