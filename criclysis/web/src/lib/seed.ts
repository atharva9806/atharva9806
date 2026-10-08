import { db } from "@/db";
import { careerStats, innings, players, traits, yearlyStats } from "@/db/schema";
import { count } from "drizzle-orm";
import { SEED_PLAYERS, type SeedPlayer, type StatTuple } from "./seed-data";

// Deterministic PRNG (mulberry32) so charts are stable across restarts.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const OPPONENTS = ["Australia", "England", "India", "New Zealand", "Pakistan", "South Africa", "Sri Lanka", "West Indies", "Bangladesh", "Afghanistan"];
const VENUES = ["MCG, Melbourne", "Lord's, London", "Eden Gardens, Kolkata", "Wankhede, Mumbai", "Gaddafi Stadium, Lahore", "Newlands, Cape Town", "Basin Reserve, Wellington", "Kensington Oval, Barbados", "Dubai International", "SCG, Sydney", "The Oval, London", "Narendra Modi Stadium, Ahmedabad"];
const DISMISSALS = ["caught", "caught", "caught", "bowled", "lbw", "caught behind", "run out", "stumped"];

function computeRating(p: SeedPlayer) {
  const a = p.attrs;
  const base = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.round(base * 10) / 10;
}

function genInnings(p: SeedPlayer, playerId: number) {
  const rows: (typeof innings.$inferInsert)[] = [];
  const r = rng(hash(p.slug));
  const now = Date.now();
  let dayOffset = 2;
  for (const st of p.stats) {
    const [fmt, , inn, , avg, sr, , , , wkts, , econ] = st;
    if (inn === 0 && wkts === 0) continue;
    const n = fmt === "Test" ? 10 : 12;
    for (let i = 0; i < n; i++) {
      const isBat = p.role !== "Bowler" || r() < 0.4;
      const isBowl = (p.role === "Bowler" || p.role === "All-rounder") && wkts > 0;
      const playedOn = new Date(now - dayOffset * 86400000);
      dayOffset += Math.floor(4 + r() * 12);
      let runs: number | null = null;
      let balls: number | null = null;
      let dismissal: string | null = null;
      if (isBat && inn > 0) {
        // Exponential-ish distribution around the average
        const u = r();
        runs = Math.min(Math.round(-Math.log(1 - u * 0.985) * avg * 1.02), fmt === "T20I" ? 125 : 260);
        if (r() < 0.12) runs = Math.min(Math.round(runs * 1.6), fmt === "T20I" ? 125 : 260);
        balls = Math.max(1, Math.round((runs / Math.max(sr, 40)) * 100 + r() * 6));
        dismissal = r() < (fmt === "Test" ? 0.1 : 0.22) ? "not out" : DISMISSALS[Math.floor(r() * DISMISSALS.length)];
      }
      let w: number | null = null;
      let rc: number | null = null;
      let ov: number | null = null;
      if (isBowl) {
        const maxOv = fmt === "Test" ? 22 : fmt === "ODI" ? 10 : 4;
        ov = fmt === "T20I" ? 4 : Math.round(maxOv * (0.6 + r() * 0.4));
        const e = econ ?? 4.5;
        rc = Math.round(ov * e * (0.7 + r() * 0.7));
        const lambda = fmt === "Test" ? 2.2 : fmt === "ODI" ? 1.6 : 1.4;
        w = Math.min(7, Math.round(-Math.log(1 - r() * 0.97) * lambda));
      }
      rows.push({
        playerId,
        format: fmt,
        opponent: OPPONENTS.filter((o) => o !== p.country)[Math.floor(r() * 9)],
        venue: VENUES[Math.floor(r() * VENUES.length)],
        playedOn,
        runs,
        balls,
        dismissal,
        wickets: w,
        runsConceded: rc,
        oversBowled: ov,
      });
    }
  }
  return rows;
}

function genYearly(p: SeedPlayer, playerId: number) {
  const rows: (typeof yearlyStats.$inferInsert)[] = [];
  const r = rng(hash(p.slug + "-y"));
  const years = 2025 - p.debut + 1;
  const totalRuns = p.stats.reduce((s, st) => s + st[3], 0);
  const totalWkts = p.stats.reduce((s, st) => s + st[9], 0);
  const avgW = p.stats.reduce((s, st) => s + st[4] * st[2], 0) / Math.max(1, p.stats.reduce((s, st) => s + st[2], 0));
  const srW = p.stats.reduce((s, st) => s + st[5] * st[2], 0) / Math.max(1, p.stats.reduce((s, st) => s + st[2], 0));
  const weights: number[] = [];
  for (let i = 0; i < years; i++) {
    const x = i / Math.max(1, years - 1);
    // career arc: ramp up, peak mid-career, slight taper
    const arc = 0.35 + Math.sin(Math.PI * Math.min(1, x * 1.1)) * 0.9 + (r() - 0.5) * 0.5;
    weights.push(Math.max(0.12, arc));
  }
  const wsum = weights.reduce((s, v) => s + v, 0);
  for (let i = 0; i < years; i++) {
    const share = weights[i] / wsum;
    rows.push({
      playerId,
      year: p.debut + i,
      runs: Math.round(totalRuns * share),
      battingAvg: Math.round(avgW * (0.6 + weights[i] * 0.55) * 10) / 10,
      strikeRate: Math.round(srW * (0.9 + (r() - 0.5) * 0.2) * 10) / 10,
      wickets: Math.round(totalWkts * share),
      economy: totalWkts > 0 ? Math.round(((p.stats.find((s) => s[11])?.[11] ?? 5) * (0.9 + r() * 0.25)) * 100) / 100 : null,
    });
  }
  return rows;
}

let seeding: Promise<void> | null = null;

export async function ensureSeeded() {
  if (seeding) return seeding;
  seeding = (async () => {
    const [{ value }] = await db.select({ value: count() }).from(players);
    if (value > 0) return;
    for (const p of SEED_PLAYERS) {
      const [row] = await db
        .insert(players)
        .values({
          slug: p.slug,
          name: p.name,
          country: p.country,
          countryCode: p.cc,
          role: p.role,
          battingStyle: p.bat,
          bowlingStyle: p.bowl ?? null,
          born: p.born,
          age: p.age,
          debutYear: p.debut,
          espnId: p.espnId,
          iccRankTest: p.ranks[0],
          iccRankOdi: p.ranks[1],
          iccRankT20: p.ranks[2],
          overallRating: computeRating(p),
          formIndex: 0,
          bio: p.bio,
          attrPower: p.attrs[0],
          attrTechnique: p.attrs[1],
          attrConsistency: p.attrs[2],
          attrTemperament: p.attrs[3],
          attrAgainstPace: p.attrs[4],
          attrAgainstSpin: p.attrs[5],
          attrFielding: p.attrs[6],
          attrFitness: p.attrs[7],
        })
        .onConflictDoNothing()
        .returning({ id: players.id });
      if (!row) continue;
      await db.insert(careerStats).values(
        p.stats.map((s: StatTuple) => ({
          playerId: row.id,
          format: s[0],
          matches: s[1],
          innings: s[2],
          runs: s[3],
          battingAvg: s[4],
          strikeRate: s[5],
          hundreds: s[6],
          fifties: s[7],
          highest: s[8],
          wickets: s[9],
          bowlingAvg: s[10],
          economy: s[11],
          bowlingSR: s[12],
          fiveWkts: s[13],
          bestBowling: s[14],
          catches: s[15],
        })),
      );
      await db.insert(traits).values([
        ...p.strengths.map((s) => ({ playerId: row.id, kind: "strength", title: s[0], detail: s[1], metric: s[2] ?? null, confidence: 80 + Math.floor(rng(hash(s[0]))() * 18) })),
        ...p.weaknesses.map((s) => ({ playerId: row.id, kind: "weakness", title: s[0], detail: s[1], metric: s[2] ?? null, confidence: 70 + Math.floor(rng(hash(s[0]))() * 25) })),
      ]);
      const inn = genInnings(p, row.id);
      if (inn.length) await db.insert(innings).values(inn);
      const yr = genYearly(p, row.id);
      if (yr.length) await db.insert(yearlyStats).values(yr);
    }
  })().finally(() => {
    seeding = null;
  });
  return seeding;
}
