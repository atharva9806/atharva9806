"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PlayerSummary } from "@/lib/analytics";
import { FormBadge, RatingRing, Sparkline, flagEmoji } from "@/components/ui";

type Fmt = "All" | "Test" | "ODI" | "T20I";
type SortKey = "rating" | "runs" | "avg" | "sr" | "wickets" | "bowlAvg" | "econ" | "form";

export default function PlayersTable({ players }: { players: PlayerSummary[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [role, setRole] = useState("");
  const [fmt, setFmt] = useState<Fmt>("All");
  const [sort, setSort] = useState<SortKey>("rating");
  const [dir, setDir] = useState<1 | -1>(-1);

  const countries = useMemo(() => Array.from(new Set(players.map((p) => p.country))).sort(), [players]);
  const roles = ["Batter", "Bowler", "All-rounder", "Wicketkeeper"];

  const rows = useMemo(() => {
    const agg = (p: PlayerSummary) => {
      const st = fmt === "All" ? p.stats : p.stats.filter((s) => s.format === fmt);
      const inn = st.reduce((s, x) => s + x.innings, 0);
      const runs = st.reduce((s, x) => s + x.runs, 0);
      const wkts = st.reduce((s, x) => s + x.wickets, 0);
      const avg = inn ? st.reduce((s, x) => s + x.battingAvg * x.innings, 0) / inn : 0;
      const sr = inn ? st.reduce((s, x) => s + x.strikeRate * x.innings, 0) / inn : 0;
      const bw = st.filter((x) => x.wickets > 0 && x.bowlingAvg);
      const bowlAvg = wkts ? bw.reduce((s, x) => s + (x.bowlingAvg ?? 0) * x.wickets, 0) / wkts : null;
      const econ = wkts ? bw.reduce((s, x) => s + (x.economy ?? 0) * x.wickets, 0) / wkts : null;
      const matches = st.reduce((s, x) => s + x.matches, 0);
      const hundreds = st.reduce((s, x) => s + x.hundreds, 0);
      return { p, matches, inn, runs, wkts, avg, sr, bowlAvg, econ, hundreds, played: st.length > 0 };
    };
    let list = players.map(agg).filter((r) => r.played);
    const ql = q.trim().toLowerCase();
    if (ql) list = list.filter((r) => r.p.name.toLowerCase().includes(ql) || r.p.country.toLowerCase().includes(ql));
    if (country) list = list.filter((r) => r.p.country === country);
    if (role) list = list.filter((r) => r.p.role === role);
    const val = (r: ReturnType<typeof agg>) =>
      sort === "rating" ? r.p.overallRating
      : sort === "runs" ? r.runs
      : sort === "avg" ? r.avg
      : sort === "sr" ? r.sr
      : sort === "wickets" ? r.wkts
      : sort === "bowlAvg" ? (r.bowlAvg ?? (dir === -1 ? -1 : 999))
      : sort === "econ" ? (r.econ ?? (dir === -1 ? -1 : 999))
      : r.p.form;
    return list.sort((a, b) => (val(a) - val(b)) * dir);
  }, [players, q, country, role, fmt, sort, dir]);

  const th = (label: string, key: SortKey, align = "text-right") => (
    <th className={`${align} cursor-pointer select-none`} onClick={() => (sort === key ? setDir(dir === 1 ? -1 : 1) : (setSort(key), setDir(-1)))}>
      <span className={`inline-flex items-center gap-1 ${sort === key ? "text-[#1d1d1f]" : ""}`}>
        {label}
        {sort === key && <span className="text-[9px]">{dir === -1 ? "▼" : "▲"}</span>}
      </span>
    </th>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6e6e73]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players or countries" className="w-full rounded-full bg-[#e8e8ed] py-2.5 pl-10 pr-4 text-sm placeholder:text-[#6e6e73] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/30" />
        </div>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm">
          <option value="">All nations</option>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm">
          <option value="">All roles</option>
          {roles.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="segment">
          {(["All", "Test", "ODI", "T20I"] as Fmt[]).map((f) => (
            <button key={f} data-active={fmt === f} onClick={() => setFmt(f)}>{f}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-apple w-full min-w-[980px]">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Player</th>
                <th className="text-left">Role</th>
                {th("Rating", "rating", "text-center")}
                <th className="text-right">Mat</th>
                {th("Runs", "runs")}
                {th("Avg", "avg")}
                {th("SR", "sr")}
                <th className="text-right">100s</th>
                {th("Wkts", "wickets")}
                {th("Bowl avg", "bowlAvg")}
                {th("Econ", "econ")}
                <th className="text-left">Last 10</th>
                {th("Form", "form", "text-left")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const spark = [...r.p.recent].reverse().slice(-10).map((x) => (r.p.role === "Bowler" ? (x.wickets ?? 0) * 20 : x.runs ?? 0));
                return (
                  <tr key={r.p.id}>
                    <td className="tabular-nums text-[#6e6e73]">{i + 1}</td>
                    <td>
                      <Link href={`/players/${r.p.slug}`} className="flex items-center gap-3">
                        <span className="text-xl">{flagEmoji(r.p.countryCode)}</span>
                        <span>
                          <span className="block font-semibold">{r.p.name}</span>
                          <span className="block text-xs text-[#6e6e73]">{r.p.country}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-[#6e6e73]">{r.p.role}</td>
                    <td className="text-center"><div className="mx-auto w-fit"><RatingRing value={r.p.overallRating} size={44} /></div></td>
                    <td className="text-right tabular-nums">{r.matches}</td>
                    <td className="text-right font-medium tabular-nums">{r.runs.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{r.avg ? r.avg.toFixed(1) : "—"}</td>
                    <td className="text-right tabular-nums">{r.sr ? r.sr.toFixed(1) : "—"}</td>
                    <td className="text-right tabular-nums">{r.hundreds}</td>
                    <td className="text-right font-medium tabular-nums">{r.wkts || "—"}</td>
                    <td className="text-right tabular-nums">{r.bowlAvg ? r.bowlAvg.toFixed(1) : "—"}</td>
                    <td className="text-right tabular-nums">{r.econ ? r.econ.toFixed(2) : "—"}</td>
                    <td><Sparkline values={spark} color={r.p.form >= 10 ? "#34c759" : r.p.form <= -10 ? "#ff9500" : "#0071e3"} /></td>
                    <td><FormBadge form={r.p.form} label={r.p.formLabel} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-black/5 px-4 py-3 text-xs text-[#6e6e73]">
          {rows.length} players · {fmt === "All" ? "all formats combined" : `${fmt} only`} · click a column to sort
        </div>
      </div>
    </div>
  );
}
