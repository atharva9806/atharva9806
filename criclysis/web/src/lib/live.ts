import { db } from "@/db";
import { liveMatches, syncLog, type LiveMatch } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rng } from "./seed";

export type LiveFeed = {
  matches: LiveMatch[];
  source: "espncricinfo" | "cricapi" | "simulated";
  fetchedAt: string;
};

const FETCH_TIMEOUT_MS = 3500;
let cache: { at: number; feed: LiveFeed } | null = null;

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 (compatible; CrickIQ/1.0)", accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(t);
  }
}

type Upsert = typeof liveMatches.$inferInsert;

// ---- Source 1: ESPNcricinfo public consumer feed ----
async function fromEspn(): Promise<Upsert[] | null> {
  try {
    const raw = (await fetchJson("https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true")) as {
      matches?: Array<{
        objectId?: number;
        title?: string;
        format?: string;
        state?: string;
        status?: string;
        statusText?: string;
        series?: { name?: string };
        ground?: { name?: string; town?: { name?: string } };
        teams?: Array<{ team?: { name?: string }; score?: string; isLive?: boolean }>;
      }>;
    };
    if (!raw?.matches?.length) return null;
    return raw.matches.slice(0, 8).map((m) => {
      const [a, b] = m.teams ?? [];
      const state = (m.state ?? "").toUpperCase();
      return {
        externalId: `espn-${m.objectId}`,
        title: m.title ?? `${a?.team?.name ?? "TBA"} v ${b?.team?.name ?? "TBA"}`,
        series: m.series?.name ?? "International",
        format: m.format ?? "—",
        venue: [m.ground?.name, m.ground?.town?.name].filter(Boolean).join(", ") || "TBA",
        status: state === "LIVE" ? "live" : state === "POST" ? "completed" : "upcoming",
        statusText: m.statusText ?? m.status ?? "",
        teamA: a?.team?.name ?? "TBA",
        teamB: b?.team?.name ?? "TBA",
        teamAScore: a?.score ?? null,
        teamBScore: b?.score ?? null,
        battingTeam: a?.isLive ? a?.team?.name ?? null : b?.isLive ? b?.team?.name ?? null : null,
        source: "espncricinfo",
        updatedAt: new Date(),
      };
    });
  } catch {
    return null;
  }
}

// ---- Source 2: CricAPI (requires CRICKET_API_KEY) ----
async function fromCricApi(): Promise<Upsert[] | null> {
  const key = process.env.CRICKET_API_KEY;
  if (!key) return null;
  try {
    const raw = (await fetchJson(`https://api.cricapi.com/v1/currentMatches?apikey=${key}&offset=0`)) as {
      data?: Array<{
        id: string;
        name: string;
        matchType?: string;
        status?: string;
        venue?: string;
        teams?: string[];
        matchStarted?: boolean;
        matchEnded?: boolean;
        score?: Array<{ r: number; w: number; o: number; inning: string }>;
      }>;
    };
    if (!raw?.data?.length) return null;
    return raw.data.slice(0, 8).map((m) => {
      const [a, b] = m.teams ?? [];
      const sa = m.score?.find((s) => a && s.inning.startsWith(a));
      const sb = m.score?.find((s) => b && s.inning.startsWith(b));
      return {
        externalId: `cricapi-${m.id}`,
        title: m.name,
        series: m.name.split(",").slice(1).join(",").trim() || "International",
        format: (m.matchType ?? "").toUpperCase(),
        venue: m.venue ?? "TBA",
        status: m.matchEnded ? "completed" : m.matchStarted ? "live" : "upcoming",
        statusText: m.status ?? "",
        teamA: a ?? "TBA",
        teamB: b ?? "TBA",
        teamAScore: sa ? `${sa.r}/${sa.w} (${sa.o})` : null,
        teamBScore: sb ? `${sb.r}/${sb.w} (${sb.o})` : null,
        battingTeam: null,
        source: "cricapi",
        updatedAt: new Date(),
      };
    });
  } catch {
    return null;
  }
}

// ---- Source 3: deterministic ball-by-ball simulation ----
const FIXTURES: Array<[string, string, string, string, string]> = [
  ["India", "Australia", "T20I", "Border-Gavaskar T20I Series", "Wankhede Stadium, Mumbai"],
  ["England", "South Africa", "ODI", "Royal London ODI Series", "Lord's, London"],
  ["Pakistan", "New Zealand", "T20I", "Tri-Nation T20 Series", "Gaddafi Stadium, Lahore"],
  ["West Indies", "Sri Lanka", "ODI", "CG United ODI Series", "Kensington Oval, Bridgetown"],
  ["Australia", "England", "T20I", "The Ashes T20 Series", "MCG, Melbourne"],
  ["Bangladesh", "Afghanistan", "ODI", "Asia Cup Qualifier", "Sher-e-Bangla, Dhaka"],
];

function parseScore(s: string | null): { r: number; w: number } {
  if (!s) return { r: 0, w: 0 };
  const m = s.match(/(\d+)\/(\d+)/);
  return m ? { r: +m[1], w: +m[2] } : { r: 0, w: 0 };
}

function ballsFromOvers(o: number | null) {
  if (!o) return 0;
  const whole = Math.floor(o);
  return whole * 6 + Math.round((o - whole) * 10);
}
function oversFromBalls(b: number) {
  return Math.floor(b / 6) + (b % 6) / 10;
}
const fmt1 = (n: number) => `${Math.floor(n)}.${Math.round((n % 1) * 10)}`;

function newSimMatch(idx: number, seedOffset: number): Upsert {
  const [a, b, format, series, venue] = FIXTURES[idx % FIXTURES.length];
  const r = rng(idx * 97 + seedOffset);
  const swap = r() < 0.5;
  const teamA = swap ? b : a;
  const teamB = swap ? a : b;
  return {
    externalId: `sim-${idx}-${seedOffset}`,
    title: `${teamA} v ${teamB}, ${format}`,
    series,
    format,
    venue,
    status: "live",
    statusText: `${teamA} won the toss and elected to bat`,
    teamA,
    teamB,
    teamAScore: "0/0",
    teamBScore: null,
    battingTeam: teamA,
    currentRunRate: 0,
    requiredRunRate: null,
    overs: 0,
    timeline: [],
    recentBalls: [],
    source: "simulated",
    updatedAt: new Date(),
  };
}

function advance(m: LiveMatch, ballsToPlay: number): Partial<LiveMatch> {
  const maxBalls = m.format === "ODI" ? 300 : 120;
  const firstInn = m.battingTeam === m.teamA;
  let score = parseScore(firstInn ? m.teamAScore : m.teamBScore);
  let balls = ballsFromOvers(m.overs);
  let timeline = [...(m.timeline ?? [])];
  const recent = [...(m.recentBalls ?? [])];
  let battingTeam = m.battingTeam;
  let inning = firstInn ? 1 : 2;
  let teamAScore = m.teamAScore;
  let teamBScore = m.teamBScore;
  let status = m.status;
  let statusText = m.statusText;
  const target = firstInn ? null : parseScore(m.teamAScore).r + 1;
  const seedBase = (m.externalId ?? "sim").split("").reduce((s, c) => s + c.charCodeAt(0), 0);

  for (let i = 0; i < ballsToPlay && status === "live"; i++) {
    const r = rng(seedBase * 1000 + inning * 100000 + balls)();
    let out = "0";
    let runs = 0;
    let wk = 0;
    const pressure = inning === 2 && target ? (target - score.r) / Math.max(1, maxBalls - balls) : 1;
    const agg = m.format === "T20I" ? 1 : 0.75;
    if (r < 0.06 + (pressure > 1.6 ? 0.03 : 0)) { out = "W"; wk = 1; }
    else if (r < 0.06 + 0.07 * agg) { out = "6"; runs = 6; }
    else if (r < 0.13 + 0.12 * agg) { out = "4"; runs = 4; }
    else if (r < 0.28 + 0.1 * agg) { out = "2"; runs = 2; }
    else if (r < 0.62) { out = "1"; runs = 1; }
    else out = "0";
    score = { r: score.r + runs, w: score.w + wk };
    balls++;
    recent.push(out);
    if (recent.length > 12) recent.shift();
    if (balls % 6 === 0) {
      timeline.push({ over: balls / 6, runs: score.r, wickets: score.w, inning });
    }
    if (firstInn && inning === 1) teamAScore = `${score.r}/${score.w}`;
    else teamBScore = `${score.r}/${score.w}`;

    const innOver = balls >= maxBalls || score.w >= 10;
    const chased = inning === 2 && target != null && score.r >= target;
    if (chased) {
      status = "completed";
      statusText = `${battingTeam} won by ${10 - score.w} wickets (${maxBalls - balls} balls remaining)`;
    } else if (innOver && inning === 1) {
      // switch innings
      inning = 2;
      battingTeam = m.teamB;
      teamAScore = `${score.r}/${score.w} (${fmt1(oversFromBalls(balls))})`;
      score = { r: 0, w: 0 };
      balls = 0;
      teamBScore = "0/0";
      recent.length = 0;
      statusText = `${m.teamB} need ${parseScore(teamAScore).r + 1} to win`;
      timeline = timeline.filter((t) => t.inning === 1);
      break; // pause at innings break for this tick
    } else if (innOver && inning === 2) {
      status = "completed";
      const margin = parseScore(teamAScore).r - score.r;
      statusText = margin === 0 ? "Match tied" : `${m.teamA} won by ${margin} runs`;
    }
  }

  const overs = oversFromBalls(balls);
  const crr = balls ? Math.round((score.r / balls) * 600) / 100 : 0;
  let rrr: number | null = null;
  if (status === "live" && inning === 2) {
    const tgt = parseScore(teamAScore).r + 1;
    const remaining = maxBalls - balls;
    rrr = remaining > 0 ? Math.round(((tgt - score.r) / remaining) * 600) / 100 : null;
    statusText = `${battingTeam} need ${Math.max(0, tgt - score.r)} from ${remaining} balls`;
  } else if (status === "live" && inning === 1) {
    statusText = `${battingTeam} batting · ${fmt1(overs)} ov`;
  }
  return { teamAScore, teamBScore, battingTeam, overs, timeline, recentBalls: recent, currentRunRate: crr, requiredRunRate: rrr, status, statusText, updatedAt: new Date() };
}

async function simulated(): Promise<LiveMatch[]> {
  const rows = await db.select().from(liveMatches).where(eq(liveMatches.source, "simulated"));
  const live = rows.filter((r) => r.status === "live");
  const now = Date.now();
  const out: LiveMatch[] = [];

  // Ensure 3 live matches exist
  const needed = 3 - live.length;
  const base = rows.length;
  for (let i = 0; i < needed; i++) {
    const idx = (base + i) % FIXTURES.length;
    const [ins] = await db.insert(liveMatches).values(newSimMatch(idx, base + i + Math.floor(now / 1e7))).onConflictDoNothing().returning();
    if (ins) rows.push(ins);
  }

  for (const m of rows) {
    if (m.status === "live") {
      const elapsed = (now - +new Date(m.updatedAt)) / 1000;
      const balls = Math.min(30, Math.floor(elapsed / 3.5)); // one ball every ~3.5s
      if (balls > 0) {
        const patch = advance(m, balls);
        const [upd] = await db.update(liveMatches).set(patch).where(eq(liveMatches.id, m.id)).returning();
        out.push(upd);
      } else out.push(m);
    } else if (m.status === "completed") {
      // Keep completed results visible for 3 minutes, then drop
      if (now - +new Date(m.updatedAt) > 180_000) await db.delete(liveMatches).where(eq(liveMatches.id, m.id));
      else out.push(m);
    }
  }
  return out.sort((a, b) => (a.status === b.status ? a.id - b.id : a.status === "live" ? -1 : 1));
}

export async function getLiveFeed(force = false): Promise<LiveFeed> {
  if (!force && cache && Date.now() - cache.at < 4000) return cache.feed;
  let source: LiveFeed["source"] = "simulated";
  let matches: LiveMatch[] = [];

  const shouldTryExternal = !cache || Date.now() - cache.at > 60_000 || cache.feed.source !== "simulated";
  if (shouldTryExternal) {
    const ext = (await fromCricApi()) ?? (await fromEspn());
    if (ext && ext.length) {
      source = ext[0].source as LiveFeed["source"];
      for (const m of ext) {
        await db
          .insert(liveMatches)
          .values(m)
          .onConflictDoUpdate({ target: liveMatches.externalId, set: { ...m, updatedAt: new Date() } });
      }
      matches = await db.select().from(liveMatches).where(eq(liveMatches.source, source));
      await db.insert(syncLog).values({ source, ok: true, message: `${matches.length} matches synced` }).catch(() => {});
    }
  }
  if (!matches.length) {
    matches = await simulated();
    source = "simulated";
  }
  const feed: LiveFeed = { matches, source, fetchedAt: new Date().toISOString() };
  cache = { at: Date.now(), feed };
  return feed;
}
