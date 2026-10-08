import { db } from "@/db";
import { careerStats, innings, players, traits, yearlyStats, type CareerStat, type Inning, type Player, type Trait, type YearlyStat } from "@/db/schema";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ensureSeeded } from "./seed";

export type PlayerSummary = Player & {
  stats: CareerStat[];
  totalRuns: number;
  totalWickets: number;
  form: number; // -100..100 relative to career baseline
  formLabel: string;
  recent: Inning[];
};

export type PlayerProfile = PlayerSummary & {
  yearly: YearlyStat[];
  traits: Trait[];
  dismissals: { name: string; value: number }[];
  formatSplit: { format: string; runs: number; avg: number; sr: number; wickets: number; economy: number | null }[];
  radar: { attribute: string; value: number }[];
  strategy: Strategy;
};

export type Strategy = {
  headline: string;
  summary: string;
  bowlingPlan: string[];
  battingPlan: string[];
  fieldPlan: string[];
  matchups: { label: string; verdict: "Favourable" | "Neutral" | "Danger"; note: string }[];
  risk: number; // 0..100 threat rating
};

export function formLabel(f: number) {
  if (f >= 30) return "Red hot";
  if (f >= 10) return "In form";
  if (f > -10) return "Steady";
  if (f > -30) return "Cooling";
  return "Slump";
}

export function computeForm(player: Player, stats: CareerStat[], recent: Inning[]) {
  const isBowler = player.role === "Bowler";
  const last = [...recent].sort((a, b) => +new Date(b.playedOn) - +new Date(a.playedOn)).slice(0, 10);
  if (!last.length) return 0;
  const wAvg = stats.reduce((s, x) => s + x.battingAvg * x.innings, 0) / Math.max(1, stats.reduce((s, x) => s + x.innings, 0));
  const totalW = stats.reduce((s, x) => s + x.wickets, 0);
  const totalM = stats.reduce((s, x) => s + x.matches, 0);
  const wpm = totalW / Math.max(1, totalM);
  let score = 0;
  let n = 0;
  for (const i of last) {
    if (!isBowler && i.runs != null) {
      score += (i.runs - wAvg) / Math.max(20, wAvg);
      n++;
    }
    if ((isBowler || player.role === "All-rounder") && i.wickets != null) {
      score += (i.wickets - wpm) / Math.max(1, wpm);
      n++;
    }
  }
  const raw = n ? (score / n) * 60 : 0;
  return Math.max(-100, Math.min(100, Math.round(raw)));
}

export async function getAllPlayers(): Promise<PlayerSummary[]> {
  await ensureSeeded();
  const ps = await db.select().from(players).orderBy(desc(players.overallRating));
  const ids = ps.map((p) => p.id);
  if (!ids.length) return [];
  const [st, inn] = await Promise.all([
    db.select().from(careerStats).where(inArray(careerStats.playerId, ids)),
    db.select().from(innings).where(inArray(innings.playerId, ids)).orderBy(desc(innings.playedOn)),
  ]);
  return ps.map((p) => {
    const stats = st.filter((s) => s.playerId === p.id);
    const recent = inn.filter((i) => i.playerId === p.id).slice(0, 12);
    const form = computeForm(p, stats, recent);
    return {
      ...p,
      stats,
      totalRuns: stats.reduce((s, x) => s + x.runs, 0),
      totalWickets: stats.reduce((s, x) => s + x.wickets, 0),
      form,
      formLabel: formLabel(form),
      recent,
    };
  });
}

export async function getPlayerBySlug(slug: string): Promise<PlayerProfile | null> {
  await ensureSeeded();
  const [p] = await db.select().from(players).where(eq(players.slug, slug));
  if (!p) return null;
  const [stats, inn, yr, tr] = await Promise.all([
    db.select().from(careerStats).where(eq(careerStats.playerId, p.id)),
    db.select().from(innings).where(eq(innings.playerId, p.id)).orderBy(desc(innings.playedOn)),
    db.select().from(yearlyStats).where(eq(yearlyStats.playerId, p.id)).orderBy(asc(yearlyStats.year)),
    db.select().from(traits).where(eq(traits.playerId, p.id)),
  ]);
  const form = computeForm(p, stats, inn);
  const dm = new Map<string, number>();
  for (const i of inn) if (i.dismissal && i.dismissal !== "not out") dm.set(i.dismissal, (dm.get(i.dismissal) ?? 0) + 1);
  const dismissals = [...dm.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const base: PlayerSummary = {
    ...p,
    stats,
    totalRuns: stats.reduce((s, x) => s + x.runs, 0),
    totalWickets: stats.reduce((s, x) => s + x.wickets, 0),
    form,
    formLabel: formLabel(form),
    recent: inn,
  };
  return {
    ...base,
    yearly: yr,
    traits: tr,
    dismissals,
    formatSplit: stats.map((s) => ({ format: s.format, runs: s.runs, avg: s.battingAvg, sr: s.strikeRate, wickets: s.wickets, economy: s.economy })),
    radar: radarOf(p),
    strategy: buildPlayerStrategy(base, tr),
  };
}

export function radarOf(p: Player) {
  return [
    { attribute: "Power", value: p.attrPower },
    { attribute: "Technique", value: p.attrTechnique },
    { attribute: "Consistency", value: p.attrConsistency },
    { attribute: "Temperament", value: p.attrTemperament },
    { attribute: "vs Pace", value: p.attrAgainstPace },
    { attribute: "vs Spin", value: p.attrAgainstSpin },
    { attribute: "Fielding", value: p.attrFielding },
    { attribute: "Fitness", value: p.attrFitness },
  ];
}

// ---------- Strategy engine ----------

export function buildPlayerStrategy(p: PlayerSummary, tr: Trait[]): Strategy {
  const isBowler = p.role === "Bowler";
  const weaknesses = tr.filter((t) => t.kind === "weakness");
  const strengths = tr.filter((t) => t.kind === "strength");
  const bowlingPlan: string[] = [];
  const battingPlan: string[] = [];
  const fieldPlan: string[] = [];
  const matchups: Strategy["matchups"] = [];

  const paceGap = p.attrAgainstPace - p.attrAgainstSpin;
  if (!isBowler) {
    if (paceGap > 5) {
      bowlingPlan.push(`Introduce spin early — ${p.name.split(" ").pop()} rates ${p.attrAgainstSpin}/100 against spin vs ${p.attrAgainstPace}/100 against pace.`);
      matchups.push({ label: "Quality spin", verdict: "Favourable", note: "Attack with slower pace through the air and a deep cover sweeper." });
      matchups.push({ label: "Express pace", verdict: "Danger", note: "Prefers pace on the ball; avoid feeding width." });
    } else if (paceGap < -5) {
      bowlingPlan.push(`Hold spin back; use hard-length pace at ${p.attrAgainstPace < 80 ? "the ribs" : "the top of off"} with two catchers behind square.`);
      matchups.push({ label: "Short-ball pace", verdict: "Favourable", note: "Test the pull early with fine leg and deep square in place." });
      matchups.push({ label: "Spin", verdict: "Danger", note: "Uses feet and sweeps well — spin will leak runs." });
    } else {
      bowlingPlan.push("Balanced attack: alternate pace and spin to deny rhythm; no obvious matchup gap.");
      matchups.push({ label: "Pace / Spin", verdict: "Neutral", note: "Rotate bowlers in short spells." });
    }
    if (p.attrTemperament < 80) bowlingPlan.push("Dry up singles for 2–3 overs — a below-par temperament rating suggests a rash release shot.");
    else bowlingPlan.push("Do not expect impatience; plan for 30+ ball set-ups with a genuine wicket-ball (e.g. the one that holds).");
    if (p.attrPower > 88) fieldPlan.push("Protect straight boundaries: long-on and long-off back from ball one in white-ball cricket.");
    else fieldPlan.push("Keep long-on up early; invite the lofted drive before the batter is set.");
    if (p.attrTechnique > 90) fieldPlan.push("Three slips and a gully with the new ball are unlikely to pay — replace with a short cover for the drive on the up.");
    else fieldPlan.push("Stack the cordon early: technique rating indicates outside-edge vulnerability in the first 20 balls.");
    for (const w of weaknesses) bowlingPlan.push(`Exploit: ${w.title} — ${w.detail}`);
    battingPlan.push(`Batting template: build around ${strengths[0]?.title ?? "core strengths"} and avoid ${weaknesses[0]?.title.toLowerCase() ?? "known danger zones"} in the first 15 balls.`);
  } else {
    battingPlan.push(`Target overs outside the powerplay: ${p.name.split(" ").pop()} is at their most dangerous with the new ball.`);
    for (const w of weaknesses) battingPlan.push(`Exploit: ${w.title} — ${w.detail}`);
    battingPlan.push("Use left–right combinations to disrupt line; pre-meditate against known variations.");
    bowlingPlan.push(`Deploy in 3-over bursts at both ends; save ${Math.max(1, Math.round(4 * (p.attrFitness / 100)))} overs for the death.`);
    fieldPlan.push("Fine leg and third man fine for the yorker; short cover for the mis-hit drive.");
    matchups.push({ label: "Left-handers", verdict: p.bowlingStyle?.includes("leg break") ? "Neutral" : "Favourable", note: "Angle across creates edges." });
    matchups.push({ label: "Set batters at death", verdict: p.attrConsistency > 88 ? "Favourable" : "Neutral", note: "Execution rating governs late-over trust." });
  }
  if (p.attrFitness < 82) fieldPlan.push("Push the batter for twos late in the innings — fitness rating suggests fatigue affects decision-making.");

  const risk = Math.round(
    Math.min(100, p.overallRating * 0.7 + Math.max(0, p.form) * 0.3 + (isBowler ? p.attrConsistency : p.attrPower) * 0.1),
  );
  const headline = isBowler
    ? `${p.name}: neutralise the new-ball threat`
    : p.form > 15
      ? `${p.name} is in form — attack early or pay later`
      : `${p.name}: press the ${weaknesses[0]?.title.toLowerCase() ?? "early phase"}`;
  const summary = `${p.name} carries an overall rating of ${p.overallRating}/100 with a form index of ${p.form > 0 ? "+" : ""}${p.form}. ${
    isBowler
      ? "The opposition should absorb the opening spell and cash in when the ball softens."
      : `The primary vulnerability is ${weaknesses[0]?.title.toLowerCase() ?? "unknown"}; the primary threat is ${strengths[0]?.title.toLowerCase() ?? "all-round excellence"}.`
  }`;
  return { headline, summary, bowlingPlan, battingPlan, fieldPlan, matchups, risk };
}

export type TeamStrategy = {
  team: string;
  opponent: string;
  squad: PlayerSummary[];
  oppSquad: PlayerSummary[];
  teamRating: number;
  oppRating: number;
  winProbability: number;
  keyThreats: { player: PlayerSummary; why: string }[];
  targets: { player: PlayerSummary; why: string }[];
  gamePlan: string[];
  radar: { attribute: string; team: number; opponent: number }[];
};

export async function buildTeamStrategy(team: string, opponent: string): Promise<TeamStrategy> {
  const all = await getAllPlayers();
  const squad = all.filter((p) => p.country === team);
  const oppSquad = all.filter((p) => p.country === opponent);
  const trs = await db.select().from(traits).where(inArray(traits.playerId, [...squad, ...oppSquad].map((p) => p.id)));
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const rating = (s: PlayerSummary[]) => avg(s.map((p) => p.overallRating + p.form * 0.15));
  const teamRating = Math.round(rating(squad) * 10) / 10;
  const oppRating = Math.round(rating(oppSquad) * 10) / 10;
  const diff = teamRating - oppRating;
  const winProbability = Math.round(100 / (1 + Math.exp(-diff / 6)));

  const keyThreats = [...oppSquad]
    .sort((a, b) => b.overallRating + b.form * 0.2 - (a.overallRating + a.form * 0.2))
    .slice(0, 3)
    .map((p) => ({ player: p, why: trs.find((t) => t.playerId === p.id && t.kind === "strength")?.title ?? "Elite rating" }));
  const targets = [...oppSquad]
    .sort((a, b) => a.form - b.form)
    .slice(0, 3)
    .map((p) => ({ player: p, why: trs.find((t) => t.playerId === p.id && t.kind === "weakness")?.title ?? "Out of form" }));

  const attrs = (s: PlayerSummary[], k: keyof Player) => Math.round(avg(s.map((p) => Number(p[k]))));
  const radar = [
    ["Power", "attrPower"],
    ["Technique", "attrTechnique"],
    ["Consistency", "attrConsistency"],
    ["Temperament", "attrTemperament"],
    ["vs Pace", "attrAgainstPace"],
    ["vs Spin", "attrAgainstSpin"],
    ["Fielding", "attrFielding"],
    ["Fitness", "attrFitness"],
  ].map(([label, key]) => ({ attribute: label, team: attrs(squad, key as keyof Player), opponent: attrs(oppSquad, key as keyof Player) }));

  const oppSpinWeak = attrs(oppSquad, "attrAgainstSpin") < attrs(oppSquad, "attrAgainstPace");
  const gamePlan = [
    oppSpinWeak
      ? `${opponent} rate lower against spin (${attrs(oppSquad, "attrAgainstSpin")}) than pace (${attrs(oppSquad, "attrAgainstPace")}). Pick two frontline spinners and bowl them through the middle overs.`
      : `${opponent} are stronger against spin than pace — load up on seam with a hard-length plan and attack the stumps.`,
    keyThreats[0] ? `Isolate ${keyThreats[0].player.name}: deny strike for the first 10 balls and bowl to the field, not the batter.` : "",
    targets[0] ? `Attack ${targets[0].player.name} (form ${targets[0].player.form}): ${targets[0].why.toLowerCase()} — bring the best bowler on immediately.` : "",
    attrs(squad, "attrPower") > attrs(oppSquad, "attrPower")
      ? `Power edge (+${attrs(squad, "attrPower") - attrs(oppSquad, "attrPower")}): back-load the innings and keep wickets in hand for the last 10 overs.`
      : "Power deficit: front-load with the field up and rely on strike rotation through the middle.",
    attrs(squad, "attrFielding") > 82 ? "Elite fielding unit — set attacking ring fields and push for run-outs." : "Prioritise boundary riders; fielding is not a differentiator.",
  ].filter(Boolean);

  return { team, opponent, squad, oppSquad, teamRating, oppRating, winProbability, keyThreats, targets, gamePlan, radar };
}
