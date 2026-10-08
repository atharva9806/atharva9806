"use client";

import { useMemo, useState } from "react";
import type { PlayerProfile } from "@/lib/analytics";
import { AttributeRadar, CareerArea, DismissalDonut, FormatBars, RecentBars } from "@/components/charts/Charts";

export default function ProfileCharts({ p }: { p: PlayerProfile }) {
  const isBowler = p.role === "Bowler";
  const [metric, setMetric] = useState<"runs" | "battingAvg" | "strikeRate" | "wickets" | "economy">(isBowler ? "wickets" : "runs");
  const [fmt, setFmt] = useState<string>("All");
  const [view, setView] = useState<"runs" | "wickets">(isBowler ? "wickets" : "runs");

  const yearly = p.yearly.map((y) => ({ year: y.year, runs: y.runs, battingAvg: y.battingAvg, strikeRate: y.strikeRate, wickets: y.wickets, economy: y.economy }));
  const formats = ["All", ...p.stats.map((s) => s.format)];

  const recent = useMemo(() => {
    const list = p.recent.filter((i) => fmt === "All" || i.format === fmt).slice(0, 15).reverse();
    return list.map((i) => ({
      label: `v ${i.opponent.slice(0, 3).toUpperCase()}`,
      value: view === "runs" ? (i.runs ?? 0) : (i.wickets ?? 0),
      sub: view === "runs" ? `${i.runs ?? 0}${i.dismissal === "not out" ? "*" : ""} (${i.balls ?? 0}) · ${i.format}` : `${i.wickets ?? 0}/${i.runsConceded ?? 0} (${i.oversBowled ?? 0}) · ${i.format}`,
    }));
  }, [p.recent, fmt, view]);

  const metricLabel: Record<string, string> = { runs: "Runs", battingAvg: "Average", strikeRate: "Strike rate", wickets: "Wickets", economy: "Economy" };
  const canBowl = p.totalWickets > 0;

  return (
    <section className="space-y-6">
      <h2 className="headline text-3xl">Interactive analysis</h2>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">Attribute map</p>
          <h3 className="mt-1 text-lg font-semibold">Skill radar</h3>
          <AttributeRadar data={p.radar} />
        </div>
        <div className="card p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d3cff]">Career progression</p>
              <h3 className="mt-1 text-lg font-semibold">{metricLabel[metric]} by year</h3>
            </div>
            <div className="segment">
              {(["runs", "battingAvg", "strikeRate", ...(canBowl ? (["wickets", "economy"] as const) : [])] as Array<typeof metric>).map((m) => (
                <button key={m} data-active={metric === m} onClick={() => setMetric(m)}>{metricLabel[m]}</button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <CareerArea data={yearly} metric={metric} color={metric === "wickets" || metric === "economy" ? "#ff375f" : "#7d3cff"} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#34c759]">Recent form</p>
              <h3 className="mt-1 text-lg font-semibold">Last 15 innings</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="segment">
                {formats.map((f) => (
                  <button key={f} data-active={fmt === f} onClick={() => setFmt(f)}>{f}</button>
                ))}
              </div>
              {canBowl && !isBowler && (
                <div className="segment">
                  <button data-active={view === "runs"} onClick={() => setView("runs")}>Bat</button>
                  <button data-active={view === "wickets"} onClick={() => setView("wickets")}>Bowl</button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4">
            {recent.length ? <RecentBars data={recent} metric={view} /> : <p className="py-16 text-center text-sm text-[#6e6e73]">No innings recorded in this format.</p>}
          </div>
        </div>
        <div className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff375f]">Dismissals</p>
          <h3 className="mt-1 text-lg font-semibold">How they get out</h3>
          {p.dismissals.length ? <DismissalDonut data={p.dismissals} /> : <p className="py-16 text-center text-sm text-[#6e6e73]">Not enough batting data.</p>}
        </div>
      </div>

      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff9500]">Format split</p>
        <h3 className="mt-1 text-lg font-semibold">Across Tests, ODIs and T20Is</h3>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <FormatBars data={p.formatSplit.map((f) => ({ format: f.format, avg: f.avg, sr: f.sr }))} keys={[{ key: "avg", name: "Batting average" }, { key: "sr", name: "Strike rate" }]} />
          {canBowl ? (
            <FormatBars data={p.formatSplit.map((f) => ({ format: f.format, wickets: f.wickets, economy: f.economy }))} keys={[{ key: "wickets", name: "Wickets" }, { key: "economy", name: "Economy" }]} />
          ) : (
            <FormatBars data={p.formatSplit.map((f) => ({ format: f.format, runs: f.runs }))} keys={[{ key: "runs", name: "Runs" }]} />
          )}
        </div>
      </div>
    </section>
  );
}
