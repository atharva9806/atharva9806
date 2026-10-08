"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  teams: string[];
  players: { slug: string; name: string; country: string }[];
  mode: "team" | "player";
  team: string;
  opponent: string;
  player: string;
};

export default function StrategyControls({ teams, players, mode, team, opponent, player }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [m, setM] = useState(mode);
  const [t, setT] = useState(team);
  const [o, setO] = useState(opponent);
  const [p, setP] = useState(player);

  const go = () => {
    const q = new URLSearchParams(m === "team" ? { mode: "team", team: t, opponent: o } : { mode: "player", player: p });
    start(() => router.push(`/strategy?${q.toString()}`));
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <div className="segment">
        <button data-active={m === "team"} onClick={() => setM("team")}>Team fixture</button>
        <button data-active={m === "player"} onClick={() => setM("player")}>Single player</button>
      </div>
      {m === "team" ? (
        <>
          <select value={t} onChange={(e) => setT(e.target.value)} className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm font-medium">
            {teams.map((x) => <option key={x}>{x}</option>)}
          </select>
          <span className="text-sm text-[#6e6e73]">vs</span>
          <select value={o} onChange={(e) => setO(e.target.value)} className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm font-medium">
            {teams.filter((x) => x !== t).map((x) => <option key={x}>{x}</option>)}
          </select>
        </>
      ) : (
        <select value={p} onChange={(e) => setP(e.target.value)} className="min-w-[260px] rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm font-medium">
          {players.map((x) => <option key={x.slug} value={x.slug}>{x.name} · {x.country}</option>)}
        </select>
      )}
      <button onClick={go} disabled={pending} className="btn-primary ml-auto disabled:opacity-60">
        {pending ? "Generating…" : "Generate plan"}
      </button>
    </div>
  );
}
