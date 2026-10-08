"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveMatch } from "@/db/schema";

export default function LiveTicker() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [source, setSource] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/live")
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setMatches(d.matches ?? []);
          setSource(d.source ?? "");
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!matches.length) return null;
  const items = [...matches, ...matches];

  return (
    <div className="relative overflow-hidden border-y border-black/5 bg-white/70 py-2.5 text-[13px]">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center gap-2 bg-white pl-6 pr-4 font-semibold">
        <span className="live-dot h-2 w-2 rounded-full bg-[#ff3b30]" />
        LIVE
        <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6e6e73]">{source}</span>
      </div>
      <div className="ticker-track flex w-max gap-10 pl-[30rem]">
        {items.map((m, i) => (
          <Link key={`${m.id}-${i}`} href="/live" className="flex items-center gap-3 whitespace-nowrap">
            <span className="font-medium">{m.teamA}</span>
            <span className="tabular-nums text-[#1d1d1f]">{m.teamAScore ?? "—"}</span>
            <span className="text-[#6e6e73]">v</span>
            <span className="font-medium">{m.teamB}</span>
            <span className="tabular-nums">{m.teamBScore ?? "—"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.status === "live" ? "bg-[#ff3b30]/10 text-[#ff3b30]" : "bg-black/5 text-[#6e6e73]"}`}>
              {m.status === "live" ? m.statusText : m.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
