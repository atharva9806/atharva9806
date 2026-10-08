import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPlayers, getPlayerBySlug } from "@/lib/analytics";
import { FormBadge, RatingRing, flagEmoji } from "@/components/ui";
import ProfileCharts from "./ProfileCharts";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPlayerBySlug(slug);
  if (!p) notFound();
  const all = await getAllPlayers();
  const rank = all.findIndex((x) => x.id === p.id) + 1;
  const isBowler = p.role === "Bowler";
  const strengths = p.traits.filter((t) => t.kind === "strength");
  const weaknesses = p.traits.filter((t) => t.kind === "weakness");
  const similar = all.filter((x) => x.id !== p.id && x.role === p.role).sort((a, b) => Math.abs(a.overallRating - p.overallRating) - Math.abs(b.overallRating - p.overallRating)).slice(0, 3);

  return (
    <div>
      {/* Header */}
      <section className="gradient-mesh border-b border-black/5">
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-14">
          <Link href="/players" className="text-sm text-[#0071e3]">← All players</Link>
          <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="fade-up">
              <p className="text-sm text-[#6e6e73]">
                {flagEmoji(p.countryCode)} {p.country} · {p.role} · #{rank} overall
              </p>
              <h1 className="headline mt-2 text-5xl md:text-6xl">{p.name}</h1>
              <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-[#6e6e73]">{p.bio}</p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">{p.battingStyle}</span>
                {p.bowlingStyle && <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">{p.bowlingStyle}</span>}
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Born {p.born}</span>
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">Debut {p.debutYear}</span>
                <FormBadge form={p.form} label={p.formLabel} />
              </div>
            </div>
            <div className="fade-up delay-2 flex items-center gap-6">
              <div className="text-center">
                <RatingRing value={p.overallRating} size={96} />
                <p className="mt-1 text-[11px] uppercase tracking-wider text-[#6e6e73]">CrickIQ rating</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["Test", p.iccRankTest],
                  ["ODI", p.iccRankOdi],
                  ["T20I", p.iccRankT20],
                ].map(([f, r]) => (
                  <div key={f as string} className="glass rounded-2xl px-4 py-3">
                    <p className="text-xl font-semibold tabular-nums">{r ? `#${r}` : "—"}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[#6e6e73]">ICC {f}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-16 px-6 py-14">
        {/* Career table */}
        <section>
          <h2 className="headline mb-5 text-3xl">Career at a glance</h2>
          <div className="card overflow-hidden">
            <table className="table-apple w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>Format</th>
                  <th className="text-right">Mat</th>
                  <th className="text-right">Inns</th>
                  <th className="text-right">Runs</th>
                  <th className="text-right">Avg</th>
                  <th className="text-right">SR</th>
                  <th className="text-right">100 / 50</th>
                  <th className="text-right">HS</th>
                  <th className="text-right">Wkts</th>
                  <th className="text-right">Bowl avg</th>
                  <th className="text-right">Econ</th>
                  <th className="text-right">BBI</th>
                  <th className="text-right">Ct</th>
                </tr>
              </thead>
              <tbody>
                {p.stats.map((s) => (
                  <tr key={s.id}>
                    <td className="font-semibold">{s.format}</td>
                    <td className="text-right tabular-nums">{s.matches}</td>
                    <td className="text-right tabular-nums">{s.innings}</td>
                    <td className="text-right font-medium tabular-nums">{s.runs.toLocaleString()}</td>
                    <td className="text-right tabular-nums">{s.battingAvg.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{s.strikeRate.toFixed(1)}</td>
                    <td className="text-right tabular-nums">{s.hundreds} / {s.fifties}</td>
                    <td className="text-right tabular-nums">{s.highest}</td>
                    <td className="text-right font-medium tabular-nums">{s.wickets || "—"}</td>
                    <td className="text-right tabular-nums">{s.bowlingAvg ? s.bowlingAvg.toFixed(2) : "—"}</td>
                    <td className="text-right tabular-nums">{s.economy ? s.economy.toFixed(2) : "—"}</td>
                    <td className="text-right tabular-nums">{s.bestBowling ?? "—"}</td>
                    <td className="text-right tabular-nums">{s.catches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Charts */}
        <ProfileCharts p={p} />

        {/* Strengths & weaknesses */}
        <section>
          <h2 className="headline mb-5 text-3xl">Strengths & weaknesses</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {strengths.map((t) => (
                <div key={t.id} className="card p-5 border-l-4 border-[#34c759]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{t.title}</h3>
                    {t.metric && <span className="whitespace-nowrap rounded-full bg-[#34c759]/10 px-2.5 py-1 text-[11px] font-semibold text-[#248a3d]">{t.metric}</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#6e6e73]">{t.detail}</p>
                  <div className="mt-3 h-1 rounded-full bg-black/5"><div className="h-1 rounded-full bg-[#34c759]" style={{ width: `${t.confidence}%` }} /></div>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-[#6e6e73]">Confidence {t.confidence}%</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {weaknesses.map((t) => (
                <div key={t.id} className="card p-5 border-l-4 border-[#ff375f]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{t.title}</h3>
                    {t.metric && <span className="whitespace-nowrap rounded-full bg-[#ff375f]/10 px-2.5 py-1 text-[11px] font-semibold text-[#ff375f]">{t.metric}</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#6e6e73]">{t.detail}</p>
                  <div className="mt-3 h-1 rounded-full bg-black/5"><div className="h-1 rounded-full bg-[#ff375f]" style={{ width: `${t.confidence}%` }} /></div>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-[#6e6e73]">Confidence {t.confidence}%</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Strategy */}
        <section className="dark-card p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Strategy plan</p>
          <h2 className="headline mt-2 text-3xl md:text-4xl">{p.strategy.headline}</h2>
          <p className="mt-3 max-w-3xl text-white/70">{p.strategy.summary}</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              [isBowler ? "How to bat against" : "How to bowl to", isBowler ? p.strategy.battingPlan : p.strategy.bowlingPlan],
              ["Field settings", p.strategy.fieldPlan],
              [isBowler ? "How to use" : "Own-team template", isBowler ? p.strategy.bowlingPlan : p.strategy.battingPlan],
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
            {p.strategy.matchups.map((m) => (
              <div key={m.label} className="rounded-2xl bg-white/5 px-4 py-3 text-sm">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.verdict === "Favourable" ? "bg-[#34c759]/20 text-[#34c759]" : m.verdict === "Danger" ? "bg-[#ff375f]/20 text-[#ff375f]" : "bg-white/10 text-white/70"}`}>{m.verdict}</span>
                <span className="font-medium">{m.label}</span>
                <span className="text-white/50"> — {m.note}</span>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <div className="flex items-center justify-between text-sm"><span className="text-white/60">Threat rating</span><span className="font-semibold">{p.strategy.risk}/100</span></div>
            <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-[#0a84ff] to-[#ff375f]" style={{ width: `${p.strategy.risk}%` }} /></div>
          </div>
        </section>

        {/* Similar */}
        <section>
          <h2 className="headline mb-5 text-2xl">Compare with</h2>
          <div className="flex flex-wrap gap-3">
            {similar.map((s) => (
              <Link key={s.id} href={`/compare?a=${p.slug}&b=${s.slug}`} className="card card-hover flex items-center gap-3 px-5 py-3">
                <span className="text-xl">{flagEmoji(s.countryCode)}</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-[#6e6e73]">{s.overallRating}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
