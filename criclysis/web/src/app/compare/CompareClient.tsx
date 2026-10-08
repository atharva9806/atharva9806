"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlayerSummary } from "@/lib/analytics";
import { AttributeRadar, FormatBars } from "@/components/charts/Charts";
import { FormBadge, RatingRing, flagEmoji } from "@/components/ui";

const ATTRS: [string, keyof PlayerSummary][] = [
  ["Power", "attrPower"],
  ["Technique", "attrTechnique"],
  ["Consistency", "attrConsistency"],
  ["Temperament", "attrTemperament"],
  ["vs Pace", "attrAgainstPace"],
  ["vs Spin", "attrAgainstSpin"],
  ["Fielding", "attrFielding"],
  ["Fitness", "attrFitness"],
];

export default function CompareClient({ players }: { players: PlayerSummary[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const aSlug = sp.get("a") ?? players[0]?.slug;
  const bSlug = sp.get("b") ?? players[1]?.slug;
  const a = players.find((p) => p.slug === aSlug) ?? players[0];
  const b = players.find((p) => p.slug === bSlug) ?? players[1];

  const set = (k: "a" | "b", v: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set(k, v);
    router.replace(`/compare?${q.toString()}`);
  };

  const radar = useMemo(() => ATTRS.map(([label, key]) => ({ attribute: label, a: Number(a[key]), b: Number(b[key]) })), [a, b]);

  const formats = ["Test", "ODI", "T20I"];
  const statRows: { label: string; fmt: string; a: number | null; b: number | null; lowerBetter?: boolean }[] = [];
  for (const f of formats) {
    const sa = a.stats.find((s) => s.format === f);
    const sb = b.stats.find((s) => s.format === f);
    if (!sa && !sb) continue;
    statRows.push({ label: "Matches", fmt: f, a: sa?.matches ?? null, b: sb?.matches ?? null });
    statRows.push({ label: "Runs", fmt: f, a: sa?.runs ?? null, b: sb?.runs ?? null });
    statRows.push({ label: "Batting avg", fmt: f, a: sa?.battingAvg ?? null, b: sb?.battingAvg ?? null });
    statRows.push({ label: "Strike rate", fmt: f, a: sa?.strikeRate ?? null, b: sb?.strikeRate ?? null });
    statRows.push({ label: "100s", fmt: f, a: sa?.hundreds ?? null, b: sb?.hundreds ?? null });
    if ((sa?.wickets ?? 0) + (sb?.wickets ?? 0) > 0) {
      statRows.push({ label: "Wickets", fmt: f, a: sa?.wickets ?? null, b: sb?.wickets ?? null });
      statRows.push({ label: "Bowling avg", fmt: f, a: sa?.bowlingAvg ?? null, b: sb?.bowlingAvg ?? null, lowerBetter: true });
      statRows.push({ label: "Economy", fmt: f, a: sa?.economy ?? null, b: sb?.economy ?? null, lowerBetter: true });
    }
  }

  const winsA = ATTRS.filter(([, k]) => Number(a[k]) > Number(b[k])).length;
  const winsB = ATTRS.filter(([, k]) => Number(b[k]) > Number(a[k])).length;

  const Head = ({ p, color, k }: { p: PlayerSummary; color: string; k: "a" | "b" }) => (
    <div className="card flex-1 p-6" style={{ borderTop: `4px solid ${color}` }}>
      <select value={p.slug} onChange={(e) => set(k, e.target.value)} className="w-full rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm font-medium">
        {players.map((x) => (
          <option key={x.slug} value={x.slug}>{x.name} · {x.country}</option>
        ))}
      </select>
      <div className="mt-5 flex items-center justify-between">
        <div>
          <p className="text-3xl">{flagEmoji(p.countryCode)}</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">{p.name}</h3>
          <p className="text-sm text-[#6e6e73]">{p.role} · {p.country}</p>
          <div className="mt-2"><FormBadge form={p.form} label={p.formLabel} /></div>
        </div>
        <RatingRing value={p.overallRating} size={80} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <Head p={a} color="#0071e3" k="a" />
        <div className="grid place-items-center text-center">
          <div className="rounded-full bg-[#1d1d1f] px-5 py-3 text-white">
            <p className="text-2xl font-semibold tabular-nums">{winsA} – {winsB}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/60">attributes won</p>
          </div>
        </div>
        <Head p={b} color="#ff375f" k="b" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">Attribute overlay</p>
          <h3 className="mt-1 text-lg font-semibold">Skill radar</h3>
          <AttributeRadar data={radar} keys={[{ key: "a", name: a.name, color: "#0071e3" }, { key: "b", name: b.name, color: "#ff375f" }]} height={340} />
        </div>
        <div className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d3cff]">Attribute deltas</p>
          <h3 className="mt-1 text-lg font-semibold">Where the gap is</h3>
          <ul className="mt-4 space-y-3">
            {ATTRS.map(([label, key]) => {
              const va = Number(a[key]);
              const vb = Number(b[key]);
              return (
                <li key={label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className={`tabular-nums font-semibold ${va > vb ? "text-[#0071e3]" : "text-[#6e6e73]"}`}>{va}</span>
                    <span className="text-xs uppercase tracking-wider text-[#6e6e73]">{label}</span>
                    <span className={`tabular-nums font-semibold ${vb > va ? "text-[#ff375f]" : "text-[#6e6e73]"}`}>{vb}</span>
                  </div>
                  <div className="mt-1 flex h-1.5 gap-1">
                    <div className="flex flex-1 justify-end rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-[#0071e3]" style={{ width: `${va}%` }} /></div>
                    <div className="flex flex-1 rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-[#ff375f]" style={{ width: `${vb}%` }} /></div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff9500]">Format comparison</p>
        <h3 className="mt-1 text-lg font-semibold">Batting average & strike rate</h3>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <FormatBars
            data={formats.map((f) => ({ format: f, [a.name]: a.stats.find((s) => s.format === f)?.battingAvg ?? 0, [b.name]: b.stats.find((s) => s.format === f)?.battingAvg ?? 0 }))}
            keys={[{ key: a.name, name: `${a.name} avg` }, { key: b.name, name: `${b.name} avg` }]}
          />
          <FormatBars
            data={formats.map((f) => ({ format: f, [a.name]: a.stats.find((s) => s.format === f)?.strikeRate ?? 0, [b.name]: b.stats.find((s) => s.format === f)?.strikeRate ?? 0 }))}
            keys={[{ key: a.name, name: `${a.name} SR` }, { key: b.name, name: `${b.name} SR` }]}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table-apple w-full">
          <thead>
            <tr>
              <th>Format</th>
              <th>Metric</th>
              <th className="text-right" style={{ color: "#0071e3" }}>{a.name}</th>
              <th className="text-right" style={{ color: "#ff375f" }}>{b.name}</th>
            </tr>
          </thead>
          <tbody>
            {statRows.map((r, i) => {
              const aWin = r.a != null && r.b != null && (r.lowerBetter ? r.a < r.b : r.a > r.b);
              const bWin = r.a != null && r.b != null && (r.lowerBetter ? r.b < r.a : r.b > r.a);
              const fmtV = (v: number | null) => (v == null ? "—" : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2));
              return (
                <tr key={i}>
                  <td className="font-semibold text-[#6e6e73]">{r.fmt}</td>
                  <td>{r.label}</td>
                  <td className={`text-right tabular-nums ${aWin ? "font-semibold text-[#0071e3]" : ""}`}>{fmtV(r.a)}</td>
                  <td className={`text-right tabular-nums ${bWin ? "font-semibold text-[#ff375f]" : ""}`}>{fmtV(r.b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
