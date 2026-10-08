"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveMatch } from "@/db/schema";
import { WormChart } from "@/components/charts/Charts";

type Feed = { matches: LiveMatch[]; source: string; fetchedAt: string };

const ballTone = (b: string) =>
  b === "W" ? "bg-[#ff3b30] text-white" : b === "6" ? "bg-[#7d3cff] text-white" : b === "4" ? "bg-[#0071e3] text-white" : b === "0" ? "bg-black/5 text-[#6e6e73]" : "bg-[#34c759]/15 text-[#248a3d]";

export default function LiveBoard() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/live")
        .then((r) => r.json())
        .then((d: Feed) => alive && setFeed(d))
        .catch(() => {});
    load();
    const t = setInterval(() => {
      load();
      setTick((x) => x + 1);
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const forceSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      const d = await fetch("/api/live").then((r) => r.json());
      setFeed(d);
    } finally {
      setSyncing(false);
    }
  };

  if (!feed) return <div className="card p-16 text-center text-sm text-[#6e6e73]">Connecting to live feed…</div>;

  const live = feed.matches.filter((m) => m.status === "live");
  const others = feed.matches.filter((m) => m.status !== "live");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#6e6e73]">
        <div className="flex items-center gap-2">
          <span className="live-dot h-2 w-2 rounded-full bg-[#ff3b30]" />
          {live.length} live · source <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">{feed.source}</span>
          <span className="text-xs">· updated {new Date(feed.fetchedAt).toLocaleTimeString()}</span>
        </div>
        <button onClick={forceSync} disabled={syncing} className="btn-ghost px-0 disabled:opacity-50">
          {syncing ? "Syncing…" : "Force re-sync from sources"}
        </button>
      </div>

      {feed.source === "simulated" && (
        <p className="rounded-2xl bg-[#ff9500]/10 px-4 py-3 text-xs text-[#c93400]">
          External feeds (ESPNcricinfo / CricAPI) are unreachable from this environment, so you&apos;re watching the CrickIQ ball-by-ball simulation engine. Set{" "}
          <code>CRICKET_API_KEY</code> to enable real match data.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {live.map((m) => (
          <MatchCard key={m.id} m={m} tick={tick} />
        ))}
      </div>

      {others.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6e6e73]">Results & upcoming</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {others.map((m) => (
              <div key={m.id} className="card p-5">
                <p className="text-xs text-[#6e6e73]">{m.series} · {m.format}</p>
                <div className="mt-2 flex items-center justify-between"><span className="font-medium">{m.teamA}</span><span className="tabular-nums">{m.teamAScore ?? "—"}</span></div>
                <div className="flex items-center justify-between"><span className="font-medium">{m.teamB}</span><span className="tabular-nums">{m.teamBScore ?? "—"}</span></div>
                <p className="mt-2 text-xs font-medium text-[#0071e3]">{m.statusText}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ m, tick }: { m: LiveMatch; tick: number }) {
  const worm = useMemo(() => {
    const t = m.timeline ?? [];
    const byOver = new Map<number, { over: number; a?: number; b?: number }>();
    for (const x of t) {
      const row = byOver.get(x.over) ?? { over: x.over };
      if (x.inning === 1) row.a = x.runs;
      else row.b = x.runs;
      byOver.set(x.over, row);
    }
    return [{ over: 0, a: 0, b: t.some((x) => x.inning === 2) ? 0 : undefined }, ...[...byOver.values()].sort((a, b) => a.over - b.over)];
  }, [m.timeline]);

  const balls = m.recentBalls ?? [];
  const lastOver = balls.slice(-6);
  const battingA = m.battingTeam === m.teamA;
  const projected = m.currentRunRate && m.overs != null ? Math.round(m.currentRunRate * (m.format === "ODI" ? 50 : 20)) : null;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between bg-[#1d1d1f] px-6 py-3 text-white">
        <div className="flex items-center gap-2 text-xs">
          <span className="live-dot h-2 w-2 rounded-full bg-[#ff3b30]" />
          <span className="font-semibold uppercase tracking-wider">Live</span>
          <span className="text-white/50">· {m.series} · {m.format}</span>
        </div>
        <span className="text-xs text-white/50">{m.venue}</span>
      </div>
      <div className="p-6">
        <div className="space-y-2">
          {[
            [m.teamA, m.teamAScore, battingA],
            [m.teamB, m.teamBScore, !battingA && m.battingTeam === m.teamB],
          ].map(([team, score, batting]) => (
            <div key={team as string} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${batting ? "bg-[#f5f5f7]" : ""}`}>
              <span className="flex items-center gap-2 text-lg font-semibold">
                {team as string}
                {batting ? <span className="text-xs">🏏</span> : null}
              </span>
              <span key={`${score}-${tick}`} className="pop-in text-2xl font-semibold tabular-nums">{(score as string) ?? "yet to bat"}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm font-medium text-[#0071e3]">{m.statusText}</p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-[#f5f5f7] p-3">
            <p className="text-lg font-semibold tabular-nums">{m.overs != null ? `${Math.floor(m.overs)}.${Math.round((m.overs % 1) * 10)}` : "—"}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#6e6e73]">Overs</p>
          </div>
          <div className="rounded-2xl bg-[#f5f5f7] p-3">
            <p className="text-lg font-semibold tabular-nums">{m.currentRunRate?.toFixed(2) ?? "—"}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#6e6e73]">CRR</p>
          </div>
          <div className="rounded-2xl bg-[#f5f5f7] p-3">
            <p className="text-lg font-semibold tabular-nums">{m.requiredRunRate != null ? m.requiredRunRate.toFixed(2) : projected ?? "—"}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#6e6e73]">{m.requiredRunRate != null ? "RRR" : "Projected"}</p>
          </div>
        </div>

        {balls.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#6e6e73]">Recent balls</p>
            <div className="flex flex-wrap gap-1.5">
              {balls.map((b, i) => (
                <span key={`${i}-${b}-${balls.length}`} className={`pop-in grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${ballTone(b)}`} style={{ animationDelay: `${i * 20}ms` }}>
                  {b}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#6e6e73]">This over: {lastOver.reduce((s, b) => s + (Number.isNaN(+b) ? 0 : +b), 0)} runs · {lastOver.filter((b) => b === "W").length} wkt</p>
          </div>
        )}

        {worm.length > 1 && (
          <div className="mt-4">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6e6e73]">Worm</p>
            <WormChart data={worm} teamA={m.teamA} teamB={m.teamB} height={180} />
          </div>
        )}
      </div>
    </div>
  );
}
