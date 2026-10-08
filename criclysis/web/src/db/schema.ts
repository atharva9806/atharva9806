import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    country: text("country").notNull(),
    countryCode: text("country_code").notNull(),
    role: text("role").notNull(), // Batter | Bowler | All-rounder | Wicketkeeper
    battingStyle: text("batting_style").notNull(),
    bowlingStyle: text("bowling_style"),
    born: text("born"),
    age: integer("age"),
    debutYear: integer("debut_year"),
    espnId: text("espn_id"),
    iccRankTest: integer("icc_rank_test"),
    iccRankOdi: integer("icc_rank_odi"),
    iccRankT20: integer("icc_rank_t20"),
    overallRating: real("overall_rating").notNull().default(0),
    formIndex: real("form_index").notNull().default(0),
    bio: text("bio"),
    // Radar attributes 0-100
    attrPower: integer("attr_power").notNull().default(50),
    attrTechnique: integer("attr_technique").notNull().default(50),
    attrConsistency: integer("attr_consistency").notNull().default(50),
    attrTemperament: integer("attr_temperament").notNull().default(50),
    attrAgainstPace: integer("attr_against_pace").notNull().default(50),
    attrAgainstSpin: integer("attr_against_spin").notNull().default(50),
    attrFielding: integer("attr_fielding").notNull().default(50),
    attrFitness: integer("attr_fitness").notNull().default(50),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("players_country_idx").on(t.country)],
);

export const careerStats = pgTable(
  "career_stats",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    format: text("format").notNull(), // Test | ODI | T20I
    matches: integer("matches").notNull().default(0),
    innings: integer("innings").notNull().default(0),
    runs: integer("runs").notNull().default(0),
    battingAvg: real("batting_avg").notNull().default(0),
    strikeRate: real("strike_rate").notNull().default(0),
    hundreds: integer("hundreds").notNull().default(0),
    fifties: integer("fifties").notNull().default(0),
    highest: integer("highest").notNull().default(0),
    wickets: integer("wickets").notNull().default(0),
    bowlingAvg: real("bowling_avg"),
    economy: real("economy"),
    bowlingSR: real("bowling_sr"),
    fiveWkts: integer("five_wkts").notNull().default(0),
    bestBowling: text("best_bowling"),
    catches: integer("catches").notNull().default(0),
  },
  (t) => [index("career_stats_player_idx").on(t.playerId)],
);

export const innings = pgTable(
  "innings",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    opponent: text("opponent").notNull(),
    venue: text("venue").notNull(),
    playedOn: timestamp("played_on").notNull(),
    runs: integer("runs"),
    balls: integer("balls"),
    dismissal: text("dismissal"), // caught | bowled | lbw | not out | ...
    wickets: integer("wickets"),
    runsConceded: integer("runs_conceded"),
    oversBowled: real("overs_bowled"),
  },
  (t) => [index("innings_player_idx").on(t.playerId)],
);

export const yearlyStats = pgTable(
  "yearly_stats",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    runs: integer("runs").notNull().default(0),
    battingAvg: real("batting_avg").notNull().default(0),
    strikeRate: real("strike_rate").notNull().default(0),
    wickets: integer("wickets").notNull().default(0),
    economy: real("economy"),
  },
  (t) => [index("yearly_stats_player_idx").on(t.playerId)],
);

export const traits = pgTable(
  "traits",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // strength | weakness
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    metric: text("metric"), // e.g. "Avg 61.2 vs pace"
    confidence: integer("confidence").notNull().default(80),
  },
  (t) => [index("traits_player_idx").on(t.playerId)],
);

export const liveMatches = pgTable("live_matches", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  title: text("title").notNull(),
  series: text("series").notNull(),
  format: text("format").notNull(),
  venue: text("venue").notNull(),
  status: text("status").notNull(), // live | upcoming | completed
  statusText: text("status_text").notNull(),
  teamA: text("team_a").notNull(),
  teamB: text("team_b").notNull(),
  teamAScore: text("team_a_score"),
  teamBScore: text("team_b_score"),
  battingTeam: text("batting_team"),
  currentRunRate: real("current_run_rate"),
  requiredRunRate: real("required_run_rate"),
  overs: real("overs"),
  timeline: jsonb("timeline").$type<{ over: number; runs: number; wickets: number; inning: number }[]>(),
  recentBalls: jsonb("recent_balls").$type<string[]>(),
  source: text("source").notNull().default("simulated"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  ok: boolean("ok").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Player = typeof players.$inferSelect;
export type CareerStat = typeof careerStats.$inferSelect;
export type Inning = typeof innings.$inferSelect;
export type YearlyStat = typeof yearlyStats.$inferSelect;
export type Trait = typeof traits.$inferSelect;
export type LiveMatch = typeof liveMatches.$inferSelect;
