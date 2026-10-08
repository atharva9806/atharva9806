import Link from "next/link";
import { getAllPlayers } from "@/lib/analytics";
import { PlayerCard, SectionTitle, flagEmoji, FormBadge } from "@/components/ui";
import LiveTicker from "@/components/LiveTicker";
import { LeaderBars } from "@/components/charts/Charts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const all = await getAllPlayers();
  const featured = [...all].sort((a, b) => b.overallRating - a.overallRating).slice(0, 8);
  const hot = [...all].sort((a, b) => b.form - a.form).slice(0, 5);
  const runLeaders = [...all].sort((a, b) => b.totalRuns - a.totalRuns).slice(0, 8).map((p) => ({ name: p.name, value: p.totalRuns }));
  const wktLeaders = [...all].sort((a, b) => b.totalWickets - a.totalWickets).slice(0, 8).map((p) => ({ name: p.name, value: p.totalWickets }));
  const countries = new Set(all.map((p) => p.country)).size;
  const totalInnings = all.reduce((s, p) => s + p.recent.length, 0);

  return (
    <>
      {/* Hero */}
      <section className="gradient-mesh relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center md:pb-28 md:pt-32">
          <p className="fade-up mb-4 text-sm font-semibold text-[#0071e3]">Introducing CrickIQ</p>
          <h1 className="headline fade-up delay-1 mx-auto max-w-4xl text-5xl md:text-7xl">
            Every player. Every career.
            <br />
            <span className="gradient-text">Decoded.</span>
          </h1>
          <p className="fade-up delay-2 mx-auto mt-6 max-w-2xl text-lg text-[#6e6e73] md:text-xl">
            Career-long analytics, strengths and weaknesses, interactive charts, live match tracking and strategy plans — for the world&apos;s best
            cricketers and teams.
          </p>
          <div className="fade-up delay-3 mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/players" className="btn-primary">
              Explore players
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
            <Link href="/live" className="btn-ghost">
              Watch live tracking →
            </Link>
          </div>

          <div className="fade-up delay-4 mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [all.length.toString(), "Players profiled"],
              [countries.toString(), "Nations"],
              [totalInnings.toLocaleString(), "Recent innings tracked"],
              ["3", "Formats"],
            ].map(([v, l]) => (
              <div key={l} className="glass rounded-2xl px-4 py-4">
                <p className="text-2xl font-semibold tabular-nums">{v}</p>
                <p className="text-xs text-[#6e6e73]">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LiveTicker />

      {/* Featured */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle eyebrow="Player ratings" title="The elite, ranked." sub="A composite rating from technique, power, consistency, temperament, matchups, fielding and fitness — updated as new innings land." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p, i) => (
            <PlayerCard key={p.id} p={p} delay={i % 4} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/players" className="btn-ghost">See all {all.length} players →</Link>
        </div>
      </section>

      {/* Form + leaders */}
      <section className="bg-[#f5f5f7] py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 lg:grid-cols-3">
          <div className="dark-card p-7 lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Form tracker</p>
            <h3 className="headline mt-2 text-3xl">Who&apos;s hot right now.</h3>
            <p className="mt-2 text-sm text-white/60">Form index compares the last 10 innings against career baselines.</p>
            <ul className="mt-6 divide-y divide-white/10">
              {hot.map((p, i) => (
                <li key={p.id}>
                  <Link href={`/players/${p.slug}`} className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-3">
                      <span className="w-4 text-sm text-white/40">{i + 1}</span>
                      <span className="text-lg">{flagEmoji(p.countryCode)}</span>
                      <span className="font-medium">{p.name}</span>
                    </span>
                    <FormBadge form={p.form} label={p.formLabel} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">International runs</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">Run machines</h3>
            <div className="mt-4">
              <LeaderBars data={runLeaders} />
            </div>
          </div>
          <div className="card p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff375f]">International wickets</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">Wicket takers</h3>
            <div className="mt-4">
              <LeaderBars data={wktLeaders} color="#ff375f" />
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle eyebrow="Toolkit" title="Built for analysts, coaches and fans." />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              href: "/players",
              title: "Career deep-dives",
              body: "Radar attribute maps, year-by-year progression, format splits, dismissal patterns and recent-innings charts for every player.",
              icon: "M3 3v18h18M7 14l4-4 4 4 5-6",
            },
            {
              href: "/compare",
              title: "Head-to-head compare",
              body: "Overlay two players across eight attributes and every format — see exactly where one edges the other.",
              icon: "M4 6h16M4 12h10M4 18h16M18 10l3 2-3 2",
            },
            {
              href: "/strategy",
              title: "Strategy planner",
              body: "Generate bowling plans, field settings and matchup verdicts for any player, or a full game plan for any team fixture.",
              icon: "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z",
            },
          ].map((f) => (
            <Link key={f.href} href={f.href} className="card card-hover p-7">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6e6e73]">{f.body}</p>
              <p className="mt-4 text-sm font-medium text-[#0071e3]">Open →</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
