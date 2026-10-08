import Link from "next/link";
import { buildTeamStrategy, getAllPlayers, getPlayerBySlug } from "@/lib/analytics";
import { SectionTitle, FormBadge, RatingRing, flagEmoji } from "@/components/ui";
import { AttributeRadar } from "@/components/charts/Charts";
import StrategyControls from "./StrategyControls";

export const dynamic = "force-dynamic";

export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ team?: string; opponent?: string; player?: string; mode?: string }> }) {
  const sp = await searchParams;
  const all = await getAllPlayers();
  const teams = Array.from(new Set(all.map((p) => p.country))).sort();
  const mode = sp.mode === "player" ? "player" : "team";
  const team = teams.includes(sp.team ?? "") ? sp.team! : "India";
  const opponent = teams.includes(sp.opponent ?? "") && sp.opponent !== team ? sp.opponent! : teams.find((t) => t !== team) ?? "Australia";
  const playerSlug = sp.player ?? all[0]?.slug;

  const ts = mode === "team" ? await buildTeamStrategy(team, opponent) : null;
  const pp = mode === "player" ? await getPlayerBySlug(playerSlug) : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <SectionTitle eyebrow="Strategy planner" title="Plan the game before it's played." sub="Generate a data-backed game plan for any fixture, or an individual dossier on any player." />
      <StrategyControls teams={teams} players={all.map((p) => ({ slug: p.slug, name: p.name, country: p.country }))} mode={mode} team={team} opponent={opponent} player={playerSlug} />

      {ts && (
        <div className="mt-8 space-y-6">
          {/* Scoreline */}
          <div className="dark-card p-8">
            <div className="grid items-center gap-6 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">Team</p>
                <h2 className="headline mt-1 text-4xl">{ts.team}</h2>
                <p className="mt-1 text-white/60">Squad rating {ts.teamRating}</p>
              </div>
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">Win probability</p>
                <p className="headline mt-1 text-6xl tabular-nums">{ts.winProbability}%</p>
                <div className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                  <div className="h-2 rounded-full bg-gradient-to-r from-[#0a84ff] to-[#34c759]" style={{ width: `${ts.winProbability}%` }} />
                </div>
              </div>
              <div className="md:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">Opponent</p>
                <h2 className="headline mt-1 text-4xl">{ts.opponent}</h2>
                <p className="mt-1 text-white/60">Squad rating {ts.oppRating}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">Squad profile</p>
              <h3 className="mt-1 text-lg font-semibold">Attribute overlay</h3>
              <AttributeRadar data={ts.radar} keys={[{ key: "team", name: ts.team, color: "#0071e3" }, { key: "opponent", name: ts.opponent, color: "#ff375f" }]} height={320} />
            </div>
            <div className="card p-6 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d3cff]">Game plan</p>
              <h3 className="mt-1 text-lg font-semibold">{ts.team} v {ts.opponent}</h3>
              <ol className="mt-4 space-y-3">
                {ts.gamePlan.map((g, i) => (
                  <li key={i} className="flex gap-4 rounded-2xl bg-[#f5f5f7] p-4 text-sm leading-relaxed">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1d1d1f] text-xs font-semibold text-white">{i + 1}</span>
                    {g}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff375f]">Key threats</p>
              <h3 className="mt-1 text-lg font-semibold">Contain these players</h3>
              <ul className="mt-4 divide-y divide-black/5">
                {ts.keyThreats.map(({ player, why }) => (
                  <li key={player.id}>
                    <Link href={`/players/${player.slug}`} className="flex items-center justify-between py-3">
                      <span className="flex items-center gap-3">
                        <span className="text-xl">{flagEmoji(player.countryCode)}</span>
                        <span>
                          <span className="block font-medium">{player.name}</span>
                          <span className="block text-xs text-[#6e6e73]">{why}</span>
                        </span>
                      </span>
                      <RatingRing value={player.overallRating} size={44} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#34c759]">Targets</p>
              <h3 className="mt-1 text-lg font-semibold">Attack these players</h3>
              <ul className="mt-4 divide-y divide-black/5">
                {ts.targets.map(({ player, why }) => (
                  <li key={player.id}>
                    <Link href={`/players/${player.slug}`} className="flex items-center justify-between py-3">
                      <span className="flex items-center gap-3">
                        <span className="text-xl">{flagEmoji(player.countryCode)}</span>
                        <span>
                          <span className="block font-medium">{player.name}</span>
                          <span className="block text-xs text-[#6e6e73]">{why}</span>
                        </span>
                      </span>
                      <FormBadge form={player.form} label={player.formLabel} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {[ts.squad, ts.oppSquad].map((sq, idx) => (
              <div key={idx} className="card overflow-hidden">
                <div className="px-5 py-4 text-sm font-semibold">{idx === 0 ? ts.team : ts.opponent} squad</div>
                <table className="table-apple w-full">
                  <thead><tr><th>Player</th><th>Role</th><th className="text-right">Rating</th><th className="text-right">Form</th></tr></thead>
                  <tbody>
                    {sq.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={`/players/${p.slug}`} className="font-medium">{p.name}</Link></td>
                        <td className="text-[#6e6e73]">{p.role}</td>
                        <td className="text-right tabular-nums">{p.overallRating}</td>
                        <td className="text-right tabular-nums">{p.form > 0 ? "+" : ""}{p.form}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {pp && (
        <div className="mt-8 space-y-6">
          <div className="dark-card p-8 md:p-10">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">Player dossier · {pp.country}</p>
                <h2 className="headline mt-2 text-4xl md:text-5xl">{pp.strategy.headline}</h2>
                <p className="mt-3 max-w-3xl text-white/70">{pp.strategy.summary}</p>
              </div>
              <div className="text-center">
                <p className="headline text-5xl tabular-nums">{pp.strategy.risk}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/50">threat rating</p>
              </div>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[
                ["Bowling plan", pp.strategy.bowlingPlan],
                ["Field settings", pp.strategy.fieldPlan],
                ["Batting plan", pp.strategy.battingPlan],
              ].map(([title, items]) => (
                <div key={title as string} className="rounded-2xl bg-white/5 p-5">
                  <h3 className="font-semibold">{title as string}</h3>
                  <ul className="mt-3 space-y-2.5 text-sm text-white/70">
                    {(items as string[]).map((s, i) => (
                      <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0a84ff]" />{s}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {pp.strategy.matchups.map((m) => (
                <div key={m.label} className="rounded-2xl bg-white/5 px-4 py-3 text-sm">
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.verdict === "Favourable" ? "bg-[#34c759]/20 text-[#34c759]" : m.verdict === "Danger" ? "bg-[#ff375f]/20 text-[#ff375f]" : "bg-white/10 text-white/70"}`}>{m.verdict}</span>
                  <span className="font-medium">{m.label}</span>
                  <span className="text-white/50"> — {m.note}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">Attribute map</p>
              <AttributeRadar data={pp.radar} />
            </div>
            <div className="card p-6 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff375f]">Evidence</p>
              <h3 className="mt-1 text-lg font-semibold">Traits driving this plan</h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {pp.traits.map((t) => (
                  <li key={t.id} className={`rounded-2xl p-4 text-sm ${t.kind === "strength" ? "bg-[#34c759]/10" : "bg-[#ff375f]/10"}`}>
                    <p className="font-semibold">{t.title}</p>
                    {t.metric && <p className="text-xs text-[#6e6e73]">{t.metric}</p>}
                  </li>
                ))}
              </ul>
              <Link href={`/players/${pp.slug}`} className="btn-ghost mt-4 px-0">Open full profile →</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
