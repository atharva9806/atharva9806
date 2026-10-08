// Compact seed dataset of international cricketers.
// Career figures approximate publicly available ESPNcricinfo / ICC records.

export type Fmt = "Test" | "ODI" | "T20I";

// [format, matches, innings, runs, avg, sr, 100s, 50s, hs, wkts, bowlAvg, econ, bowlSR, 5w, bb, catches]
export type StatTuple = [
  Fmt,
  number, number, number, number, number, number, number, number,
  number, number | null, number | null, number | null, number, string | null, number,
];

export type SeedPlayer = {
  slug: string;
  name: string;
  country: string;
  cc: string;
  role: "Batter" | "Bowler" | "All-rounder" | "Wicketkeeper";
  bat: string;
  bowl?: string;
  born: string;
  age: number;
  debut: number;
  espnId: string;
  ranks: [number | null, number | null, number | null]; // Test, ODI, T20I
  attrs: [number, number, number, number, number, number, number, number]; // power, technique, consistency, temperament, vsPace, vsSpin, fielding, fitness
  bio: string;
  stats: StatTuple[];
  strengths: [string, string, string?][];
  weaknesses: [string, string, string?][];
};

export const SEED_PLAYERS: SeedPlayer[] = [
  {
    slug: "virat-kohli", name: "Virat Kohli", country: "India", cc: "IN", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm medium",
    born: "5 Nov 1988, Delhi", age: 37, debut: 2008, espnId: "253802", ranks: [null, 3, null],
    attrs: [82, 94, 93, 96, 92, 84, 88, 97],
    bio: "The modern master of the chase. Kohli's combination of orthodox technique, extraordinary fitness and a relentless hunger for runs has redefined batting standards across all three formats.",
    stats: [
      ["Test", 123, 210, 9230, 46.85, 55.6, 30, 31, 254, 0, null, null, null, 0, null, 121],
      ["ODI", 302, 290, 14181, 57.88, 93.3, 51, 74, 183, 5, 166.2, 6.2, 160, 0, "1/15", 160],
      ["T20I", 125, 117, 4188, 48.69, 137.0, 1, 38, 122, 4, 51.0, 8.3, 36, 0, "1/13", 54],
    ],
    strengths: [
      ["Chase master", "Averages 64+ in successful ODI chases with 27 hundreds batting second — the best record in history.", "ODI chasing avg 64.3"],
      ["Cover-drive & wristy flicks", "Exceptional balance lets him drive on the up through cover and whip pace through mid-wicket.", "SR 118 vs full deliveries"],
      ["Running between wickets", "Converts ones into twos relentlessly; his strike-rotation keeps required rates under control.", "Dot-ball % 38 (ODI)"],
    ],
    weaknesses: [
      ["Outside off-stump in England", "Prone to nicking off to balls angled across him on the 4th–5th stump line early in an innings.", "Avg 33.5 in England Tests"],
      ["Left-arm spin in middle overs", "Strike rate dips sharply against left-arm orthodox in T20 middle overs.", "SR 104 vs SLA (T20I)"],
    ],
  },
  {
    slug: "rohit-sharma", name: "Rohit Sharma", country: "India", cc: "IN", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm off break",
    born: "30 Apr 1987, Nagpur", age: 38, debut: 2007, espnId: "34102", ranks: [null, 4, null],
    attrs: [93, 86, 78, 84, 90, 88, 78, 82],
    bio: "The 'Hitman'. Owner of the three highest ODI scores in history and the only man with three ODI double-hundreds. Effortless timing meets brutal six-hitting.",
    stats: [
      ["Test", 67, 116, 4301, 40.57, 57.0, 12, 18, 212, 2, 112.0, 3.6, 186, 0, "1/26", 61],
      ["ODI", 273, 265, 11168, 48.76, 92.8, 32, 58, 264, 9, 64.4, 5.2, 74, 0, "2/27", 99],
      ["T20I", 159, 151, 4231, 32.05, 140.9, 5, 32, 121, 1, 113.0, 9.9, 68, 0, "1/22", 65],
    ],
    strengths: [
      ["Pull shot", "Arguably the best puller of the ball in world cricket; anything short is punished square.", "SR 187 vs short balls"],
      ["Six-hitting", "Most sixes in international cricket history; clears any boundary once set.", "600+ intl sixes"],
      ["Powerplay intent", "Since 2023 has transformed his powerplay approach, striking at 130+ in ODIs.", "PP SR 131 (2023-25)"],
    ],
    weaknesses: [
      ["Early-innings vulnerability", "Slow starter historically — dismissed inside 10 balls in 28% of ODI innings.", "28% dismissals <10 balls"],
      ["Left-arm pace swinging in", "Susceptible to the ball nipping back from left-arm quicks, especially LBW.", "Avg 24 vs LA pace"],
    ],
  },
  {
    slug: "jasprit-bumrah", name: "Jasprit Bumrah", country: "India", cc: "IN", role: "Bowler", bat: "Right-hand bat", bowl: "Right-arm fast",
    born: "6 Dec 1993, Ahmedabad", age: 32, debut: 2016, espnId: "625383", ranks: [1, 2, 4],
    attrs: [40, 96, 95, 92, 45, 50, 70, 80],
    bio: "A generational fast bowler with a unique hyper-extended action, Bumrah is the only bowler with 200+ Test wickets at an average under 20.",
    stats: [
      ["Test", 47, 76, 782, 7.2, 46.0, 0, 0, 34, 219, 19.6, 2.76, 42.5, 15, "6/27", 10],
      ["ODI", 89, 30, 90, 7.5, 60.0, 0, 0, 16, 149, 23.5, 4.6, 30.6, 2, "6/19", 20],
      ["T20I", 70, 10, 8, 4.0, 60.0, 0, 0, 7, 89, 17.7, 6.27, 16.9, 0, "3/7", 8],
    ],
    strengths: [
      ["Yorker at the death", "Executes the toe-crusher at will — the most economical death bowler in T20 history.", "Death econ 6.9 (T20I)"],
      ["Seam movement both ways", "Deceptive release point delivers late in-swing and away seam from the same action.", "Test SR 42.5"],
      ["Slower-ball variations", "Off-cutter and knuckle ball disguised perfectly in the run-up.", "Dot-ball % 47 (T20I)"],
    ],
    weaknesses: [
      ["Injury history", "Lower-back stress fractures mean workload must be carefully managed.", "Missed 40% of games 2022-23"],
      ["Batting contribution", "Offers minimal runs at No. 11 — a genuine tail.", "Test avg 7.2"],
    ],
  },
  {
    slug: "ravindra-jadeja", name: "Ravindra Jadeja", country: "India", cc: "IN", role: "All-rounder", bat: "Left-hand bat", bowl: "Slow left-arm orthodox",
    born: "6 Dec 1988, Navagam-Khed", age: 37, debut: 2009, espnId: "234675", ranks: [3, null, null],
    attrs: [72, 80, 86, 84, 74, 88, 98, 92],
    bio: "The complete all-rounder — miserly spin, gutsy lower-order runs and the finest fielder of his generation.",
    stats: [
      ["Test", 83, 122, 3697, 36.6, 58.0, 4, 26, 175, 330, 24.5, 2.5, 58.6, 15, "7/42", 47],
      ["ODI", 204, 139, 2806, 32.6, 85.3, 0, 13, 87, 231, 36.4, 4.9, 44.5, 1, "5/33", 90],
      ["T20I", 74, 45, 515, 21.5, 127.2, 0, 0, 46, 54, 29.8, 7.1, 25.2, 0, "3/15", 30],
    ],
    strengths: [
      ["Relentless accuracy", "Lands the ball on a coin — economy under 2.5 in Tests keeps pressure on constantly.", "Test econ 2.50"],
      ["Elite fielding", "Direct-hit specialist with a rocket arm — worth 15–20 runs a game in the field.", "Run-outs: 60+ intl"],
      ["Home-conditions dominance", "Averages under 21 with the ball in India.", "Test avg 20.8 (home)"],
    ],
    weaknesses: [
      ["Overseas bowling returns", "Test bowling average balloons to 33 in SENA countries.", "Avg 33.1 in SENA"],
      ["Limited T20 batting impact", "Struggles to accelerate against quality spin in the middle overs.", "T20I SR 127"],
    ],
  },
  {
    slug: "shubman-gill", name: "Shubman Gill", country: "India", cc: "IN", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm off break",
    born: "8 Sep 1999, Fazilka", age: 26, debut: 2019, espnId: "1070173", ranks: [8, 1, null],
    attrs: [78, 90, 80, 82, 86, 84, 80, 88],
    bio: "India's heir apparent. Elegant back-foot play and a growing appetite for daddy hundreds — the youngest ODI double-centurion.",
    stats: [
      ["Test", 36, 66, 2500, 40.3, 61.0, 9, 8, 269, 0, null, null, null, 0, null, 30],
      ["ODI", 55, 55, 2775, 59.0, 101.0, 8, 15, 208, 0, null, null, null, 0, null, 25],
      ["T20I", 21, 21, 578, 30.4, 139.3, 1, 3, 126, 0, null, null, null, 0, null, 8],
    ],
    strengths: [
      ["Back-foot punch", "Stands tall and punches through point off the back foot with time to spare.", "SR 142 vs short-of-length"],
      ["ODI conversion", "Converts starts into big scores — 8 hundreds from 15 fifty-plus scores.", "Conversion 53%"],
    ],
    weaknesses: [
      ["Moving ball outside off", "Hangs the bat at balls seaming away, especially in England/NZ.", "Test avg 27 in SENA"],
      ["T20 tempo", "Takes 12–15 balls to get going; strike rate in first 10 balls is 105.", "SR 105 (balls 1-10)"],
    ],
  },
  {
    slug: "suryakumar-yadav", name: "Suryakumar Yadav", country: "India", cc: "IN", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm medium",
    born: "14 Sep 1990, Mumbai", age: 35, debut: 2021, espnId: "446507", ranks: [null, null, 3],
    attrs: [92, 84, 72, 86, 88, 90, 86, 84],
    bio: "Mr 360°. The most innovative T20 batter on the planet, scoring behind square at will and reaching No. 1 in the ICC T20I rankings.",
    stats: [
      ["Test", 1, 1, 8, 8.0, 80.0, 0, 0, 8, 0, null, null, null, 0, null, 0],
      ["ODI", 37, 35, 773, 25.8, 105.3, 0, 4, 72, 0, null, null, null, 0, null, 14],
      ["T20I", 83, 79, 2600, 38.0, 167.0, 4, 21, 117, 0, null, null, null, 0, null, 42],
    ],
    strengths: [
      ["360-degree scoring", "Scoops, ramps and sweeps pace — 31% of runs come behind square.", "31% runs behind square"],
      ["Middle-over acceleration", "Strikes at 170+ in overs 7–15 when most batters consolidate.", "SR 172 (overs 7-15)"],
    ],
    weaknesses: [
      ["ODI adaptation", "Struggles to pace 50-over innings; average under 26.", "ODI avg 25.8"],
      ["Hard-length ball at body", "Cramped by back-of-a-length deliveries on the hip early on.", "Avg 19 vs hard length"],
    ],
  },
  {
    slug: "yashasvi-jaiswal", name: "Yashasvi Jaiswal", country: "India", cc: "IN", role: "Batter", bat: "Left-hand bat", bowl: "Right-arm leg break",
    born: "28 Dec 2001, Bhadohi", age: 24, debut: 2023, espnId: "1151278", ranks: [5, null, null],
    attrs: [88, 84, 78, 80, 82, 90, 76, 90],
    bio: "The fearless opener who announced himself with a Test debut 171 and two double-hundreds in one series against England.",
    stats: [
      ["Test", 25, 46, 2300, 52.0, 68.0, 6, 11, 214, 0, null, null, null, 0, null, 24],
      ["ODI", 1, 1, 15, 15.0, 68.0, 0, 0, 15, 0, null, null, null, 0, null, 0],
      ["T20I", 23, 22, 723, 36.1, 164.3, 0, 5, 100, 0, null, null, null, 0, null, 10],
    ],
    strengths: [
      ["Attacking spin", "Uses feet and sweeps hard — strikes at 85+ against spin in Tests.", "SR 87 vs spin (Test)"],
      ["Big-score appetite", "Two 200+ scores before age 23; averages 52 in Tests.", "2 double hundreds"],
    ],
    weaknesses: [
      ["Away-swing early", "Reaches for the outswinger in the first 20 balls of an innings.", "42% dismissals caught behind/slips"],
      ["Short ball at body", "Hooks instinctively and often top-edges against genuine pace.", "Avg 22 vs bouncers"],
    ],
  },
  {
    slug: "hardik-pandya", name: "Hardik Pandya", country: "India", cc: "IN", role: "All-rounder", bat: "Right-hand bat", bowl: "Right-arm fast-medium",
    born: "11 Oct 1993, Surat", age: 32, debut: 2016, espnId: "625371", ranks: [null, null, null],
    attrs: [90, 72, 68, 80, 76, 82, 84, 78],
    bio: "India's premier white-ball finisher and a genuine sixth-bowler option who balances any XI.",
    stats: [
      ["Test", 11, 18, 532, 31.3, 70.0, 1, 4, 108, 17, 31.1, 3.9, 48, 1, "5/28", 7],
      ["ODI", 92, 66, 1800, 33.5, 110.0, 0, 11, 92, 89, 35.5, 5.6, 38, 0, "4/24", 40],
      ["T20I", 115, 92, 1800, 27.0, 141.0, 0, 4, 71, 94, 26.5, 8.1, 19.6, 0, "4/16", 45],
    ],
    strengths: [
      ["Death-over finishing", "Strikes at 190+ in overs 17–20 with a long straight-hitting arc.", "SR 192 (overs 17-20)"],
      ["Bouncer as a wicket-ball", "Uses the short ball intelligently for middle-over breakthroughs.", "34% wkts via short ball"],
    ],
    weaknesses: [
      ["Fitness reliability", "Recurring back and ankle issues limit bowling loads.", "Bowled in 68% of games"],
      ["Quality spin early", "Strike rate below 100 in the first 10 balls against leg-spin.", "SR 96 vs leg-spin (first 10)"],
    ],
  },
  {
    slug: "joe-root", name: "Joe Root", country: "England", cc: "GB", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm off break",
    born: "30 Dec 1990, Sheffield", age: 35, debut: 2012, espnId: "303669", ranks: [1, null, null],
    attrs: [70, 96, 92, 90, 90, 92, 82, 90],
    bio: "England's greatest Test run-scorer. Root's late-cut, sweep and sublime tempo have made him the benchmark of modern Test batting.",
    stats: [
      ["Test", 156, 285, 13006, 51.0, 56.5, 38, 66, 262, 71, 45.0, 3.1, 87, 1, "5/8", 200],
      ["ODI", 171, 160, 6522, 47.6, 86.7, 16, 39, 133, 27, 61.0, 5.6, 65, 0, "3/52", 80],
      ["T20I", 32, 30, 893, 35.7, 126.3, 0, 5, 90, 6, 47.0, 8.2, 34, 0, "2/9", 15],
    ],
    strengths: [
      ["Sweep & reverse-sweep vs spin", "Averages 70+ against spin since 2021, scoring at nearly 4 an over.", "Avg 71 vs spin (2021-)"],
      ["Late cut", "Manipulates the field with the softest hands behind point.", "SR 160 late-cut"],
      ["Longevity & consistency", "Has passed 1,000 Test runs in a calendar year six times.", "6x 1000-run years"],
    ],
    weaknesses: [
      ["Conversion in Australia", "No Test hundred in Australia across 14 matches.", "Avg 35.7 in AUS"],
      ["T20 power", "Boundary percentage lags modern T20 standards.", "T20I SR 126"],
    ],
  },
  {
    slug: "ben-stokes", name: "Ben Stokes", country: "England", cc: "GB", role: "All-rounder", bat: "Left-hand bat", bowl: "Right-arm fast-medium",
    born: "4 Jun 1991, Christchurch", age: 34, debut: 2011, espnId: "311158", ranks: [null, null, null],
    attrs: [92, 78, 70, 98, 80, 76, 90, 84],
    bio: "England's talisman and captain. Headingley 2019 and the 2019 World Cup final cemented Stokes as cricket's ultimate big-moment player.",
    stats: [
      ["Test", 114, 208, 6700, 35.5, 57.3, 13, 33, 258, 220, 31.8, 3.3, 57.6, 4, "6/22", 110],
      ["ODI", 114, 99, 3463, 38.9, 95.3, 5, 24, 182, 74, 42.4, 6.0, 42, 0, "5/61", 50],
      ["T20I", 43, 36, 585, 19.5, 133.5, 0, 0, 52, 26, 33.0, 8.4, 23.5, 0, "4/26", 20],
    ],
    strengths: [
      ["Clutch temperament", "Thrives when the match is on the line — averages 56 in 4th-innings Test chases.", "4th-inns avg 56"],
      ["Reverse-swing spells", "Bowls long, hostile spells with the old ball to break partnerships.", "Avg 24 in 3rd spells"],
      ["Leadership impact", "England's Test win rate jumped from 17% to 65% under his captaincy.", "Win% 65 as captain"],
    ],
    weaknesses: [
      ["Knee & hamstring load", "Bowling workload heavily managed after multiple surgeries.", "Overs/match down 40%"],
      ["Off-spin early", "Susceptible to being tied down and lbw by off-spin in first 15 balls.", "Avg 23 vs off-spin"],
    ],
  },
  {
    slug: "jos-buttler", name: "Jos Buttler", country: "England", cc: "GB", role: "Wicketkeeper", bat: "Right-hand bat",
    born: "8 Sep 1990, Taunton", age: 35, debut: 2011, espnId: "308967", ranks: [null, null, 8],
    attrs: [95, 76, 70, 82, 86, 84, 88, 86],
    bio: "England's most destructive white-ball batter — the fastest ODI century by an Englishman and a T20 World Cup-winning captain.",
    stats: [
      ["Test", 57, 100, 2907, 31.9, 54.4, 2, 18, 152, 0, null, null, null, 0, null, 150],
      ["ODI", 190, 158, 5300, 41.0, 117.0, 12, 27, 162, 0, null, null, null, 0, null, 230],
      ["T20I", 130, 118, 3500, 35.0, 146.0, 1, 26, 101, 0, null, null, null, 0, null, 60],
    ],
    strengths: [
      ["Death-over destruction", "Ramps and scoops yorkers over the keeper — SR 210 in the last five overs.", "SR 210 (overs 46-50)"],
      ["Powerplay opener in T20", "Balances aggression with low dismissal rate at the top.", "PP SR 138, avg 41"],
    ],
    weaknesses: [
      ["Red-ball technique", "Loose outside off in Tests; average under 32.", "Test avg 31.9"],
      ["Inswinging yorker early", "Gets bowled/lbw frequently to full inswing before he's set.", "22% dismissals bowled/lbw"],
    ],
  },
  {
    slug: "harry-brook", name: "Harry Brook", country: "England", cc: "GB", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm medium",
    born: "22 Feb 1999, Keighley", age: 26, debut: 2022, espnId: "911707", ranks: [2, null, null],
    attrs: [90, 84, 78, 82, 88, 82, 84, 90],
    bio: "The poster boy of Bazball. Brook scores at nearly 90 per hundred balls in Tests while averaging close to 60.",
    stats: [
      ["Test", 30, 52, 2800, 58.0, 88.0, 9, 12, 317, 3, 42.0, 4.2, 60, 0, "1/8", 20],
      ["ODI", 30, 27, 900, 33.0, 95.0, 1, 5, 110, 0, null, null, null, 0, null, 15],
      ["T20I", 45, 40, 900, 25.0, 145.0, 0, 3, 81, 0, null, null, null, 0, null, 22],
    ],
    strengths: [
      ["Scoring speed in Tests", "Strike rate of 88 is unmatched among batters averaging 50+.", "Test SR 88"],
      ["Pace off the back foot", "Devastating puller and cutter of anything short in Australia/SA.", "Avg 79 in PAK/NZ"],
    ],
    weaknesses: [
      ["Spin in Asia early", "Tends to over-attack against spin in India before settling.", "Avg 27 in India"],
      ["ODI role clarity", "Yet to nail a tempo for 50-over cricket.", "ODI avg 33"],
    ],
  },
  {
    slug: "steve-smith", name: "Steve Smith", country: "Australia", cc: "AU", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm leg break",
    born: "2 Jun 1989, Sydney", age: 36, debut: 2010, espnId: "267192", ranks: [4, null, null],
    attrs: [70, 90, 94, 94, 96, 86, 90, 84],
    bio: "The most unorthodox great of the modern era. Smith's fidgety trigger movement hides a Bradman-esque hunger and freakish hand-eye coordination.",
    stats: [
      ["Test", 118, 211, 10477, 55.7, 54.0, 36, 44, 239, 19, 55.0, 3.4, 96, 0, "3/18", 200],
      ["ODI", 170, 150, 5800, 43.3, 87.6, 12, 35, 164, 28, 35.0, 5.2, 40, 0, "3/16", 90],
      ["T20I", 67, 55, 1094, 24.9, 125.3, 0, 4, 90, 17, 32.0, 7.4, 26, 0, "3/20", 40],
    ],
    strengths: [
      ["Leg-side manipulation", "Walks across and works balls from off-stump through mid-wicket at will.", "44% runs leg side"],
      ["Ashes dominance", "Averages 56 against England with 12 hundreds.", "12 Ashes tons"],
      ["Slip catching", "One of the safest pairs of hands at second slip in the world.", "200 Test catches"],
    ],
    weaknesses: [
      ["Left-arm pace from around", "Neil Wagner/Broad-style angle into the body has troubled him.", "Avg 28 vs LA pace since 2021"],
      ["T20 strike rate", "Struggles to clear the rope consistently in T20s.", "T20I SR 125"],
    ],
  },
  {
    slug: "pat-cummins", name: "Pat Cummins", country: "Australia", cc: "AU", role: "Bowler", bat: "Right-hand bat", bowl: "Right-arm fast",
    born: "8 May 1993, Westmead", age: 32, debut: 2011, espnId: "489889", ranks: [2, 6, null],
    attrs: [65, 92, 94, 96, 45, 50, 78, 92],
    bio: "Australia's captain and spearhead. Cummins' relentless hard-length accuracy at 140kph+ makes him the most complete Test quick of his generation.",
    stats: [
      ["Test", 68, 95, 1378, 17.7, 47.0, 0, 2, 63, 301, 22.4, 2.9, 46.5, 13, "6/23", 30],
      ["ODI", 90, 45, 550, 16.0, 88.0, 0, 0, 37, 143, 28.1, 5.2, 32.4, 1, "5/70", 30],
      ["T20I", 55, 20, 150, 12.0, 120.0, 0, 0, 24, 61, 25.0, 7.4, 20.3, 0, "3/15", 15],
    ],
    strengths: [
      ["Hard-length precision", "Bowls the heavy length that batters can neither drive nor pull.", "Test avg 22.4"],
      ["Big-final temperament", "Player of the Match-defining spells in the WTC and ODI World Cup finals.", "3 ICC titles as captain"],
    ],
    weaknesses: [
      ["Sub-continent averages", "Wicket-taking threat diminishes on slow, low pitches.", "Avg 31 in Asia"],
      ["Powerplay economy in T20", "Leaks runs when the new ball doesn't swing.", "T20I PP econ 8.6"],
    ],
  },
  {
    slug: "mitchell-starc", name: "Mitchell Starc", country: "Australia", cc: "AU", role: "Bowler", bat: "Left-hand bat", bowl: "Left-arm fast",
    born: "30 Jan 1990, Baulkham Hills", age: 36, debut: 2010, espnId: "311592", ranks: [7, 5, null],
    attrs: [70, 84, 76, 82, 50, 55, 72, 84],
    bio: "The most lethal new-ball bowler in World Cup history, Starc's swinging yorkers at 150kph have taken 400+ Test wickets.",
    stats: [
      ["Test", 100, 140, 2400, 22.0, 60.0, 0, 11, 99, 402, 27.0, 3.4, 47.6, 16, "6/9", 40],
      ["ODI", 127, 60, 600, 14.0, 90.0, 0, 0, 52, 244, 23.4, 5.2, 27.0, 9, "6/28", 40],
      ["T20I", 65, 15, 100, 10.0, 110.0, 0, 0, 21, 79, 23.0, 7.7, 18.0, 0, "4/20", 18],
    ],
    strengths: [
      ["New-ball swing", "First-over wickets are a trademark — 30+ ODI wickets inside the first 3 overs.", "ODI SR 27 with new ball"],
      ["Left-arm angle to right-handers", "Full, fast and swinging back in — lbw/bowled machine.", "38% wkts bowled/lbw"],
    ],
    weaknesses: [
      ["Economy when not swinging", "Goes at 4+ in Tests when conditions are flat.", "Test econ 3.4"],
      ["Consistency of length", "Radar drifts full-and-wide late in spells.", "Boundary % 14"],
    ],
  },
  {
    slug: "travis-head", name: "Travis Head", country: "Australia", cc: "AU", role: "Batter", bat: "Left-hand bat", bowl: "Right-arm off break",
    born: "29 Dec 1993, Adelaide", age: 32, debut: 2016, espnId: "530011", ranks: [6, 7, 5],
    attrs: [94, 76, 70, 90, 88, 80, 80, 86],
    bio: "The final-day destroyer. Head's hundreds in the WTC and ODI World Cup finals of 2023 made him Australia's most feared counter-attacker.",
    stats: [
      ["Test", 58, 100, 3900, 42.0, 66.0, 9, 19, 175, 12, 40.0, 3.8, 63, 0, "2/10", 40],
      ["ODI", 75, 72, 2800, 43.0, 108.0, 6, 14, 154, 20, 42.0, 5.5, 46, 0, "2/32", 30],
      ["T20I", 45, 44, 1100, 28.0, 160.0, 0, 6, 80, 5, 40.0, 8.5, 28, 0, "2/9", 18],
    ],
    strengths: [
      ["Powerplay carnage", "Strikes at 170 in the first 6 overs of T20Is and 120 in ODI powerplays.", "T20I PP SR 170"],
      ["Big-match temperament", "137 in the ODI WC final; 163 in the WTC final.", "Final avg 150"],
    ],
    weaknesses: [
      ["Short ball at the ribs", "Compulsive hooker; falls to well-directed bouncers.", "36% dismissals to short ball"],
      ["Spin in Asia", "Average dips below 30 against quality spin on turners.", "Avg 28 vs spin in Asia"],
    ],
  },
  {
    slug: "marnus-labuschagne", name: "Marnus Labuschagne", country: "Australia", cc: "AU", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm leg break",
    born: "22 Jun 1994, Klerksdorp", age: 31, debut: 2018, espnId: "787987", ranks: [10, null, null],
    attrs: [62, 90, 82, 86, 90, 78, 80, 88],
    bio: "The first concussion substitute in Test history who became the world's No. 1 batter within two years.",
    stats: [
      ["Test", 55, 98, 4300, 47.0, 53.0, 11, 22, 215, 15, 60.0, 4.0, 90, 0, "3/45", 50],
      ["ODI", 60, 55, 1900, 36.0, 84.0, 1, 12, 124, 12, 45.0, 5.8, 47, 0, "3/19", 30],
    ],
    strengths: [
      ["Judgment outside off", "Leaves and defends beautifully; extremely hard to dismiss early at home.", "Avg 60 in AUS"],
      ["Concentration", "Faces 100+ balls in 45% of Test innings.", "45% innings 100+ balls"],
    ],
    weaknesses: [
      ["Strike-rate pressure", "Can get bogged down and lose momentum in white-ball cricket.", "ODI SR 84"],
      ["Away swing in England", "Averages just 31 in English conditions.", "Avg 31 in ENG"],
    ],
  },
  {
    slug: "glenn-maxwell", name: "Glenn Maxwell", country: "Australia", cc: "AU", role: "All-rounder", bat: "Right-hand bat", bowl: "Right-arm off break",
    born: "14 Oct 1988, Kew", age: 37, debut: 2012, espnId: "325026", ranks: [null, null, 12],
    attrs: [98, 70, 58, 88, 84, 92, 92, 76],
    bio: "The 'Big Show'. His 201* on one leg against Afghanistan in the 2023 World Cup is the greatest ODI innings ever played.",
    stats: [
      ["Test", 7, 14, 339, 26.1, 69.0, 1, 0, 104, 8, 42.0, 3.5, 72, 0, "4/127", 5],
      ["ODI", 149, 133, 3990, 33.8, 126.7, 4, 23, 201, 77, 48.0, 5.6, 51, 0, "4/40", 90],
      ["T20I", 113, 105, 2533, 29.1, 154.7, 5, 11, 145, 50, 32.0, 7.7, 25, 0, "3/10", 50],
    ],
    strengths: [
      ["Reverse-sweep & switch hit", "Destroys spin with 360° options; SR 155 vs spin in T20Is.", "SR 155 vs spin"],
      ["Utility off-spin", "Reliable middle-over option going under 6 an over in ODIs.", "ODI econ 5.6"],
    ],
    weaknesses: [
      ["Consistency", "Boom-or-bust — 41% of T20I innings end under 15 runs.", "41% inns <15"],
      ["Full swinging ball early", "Vulnerable to the pitched-up in-swinger in his first 5 balls.", "27% dismissals bowled/lbw"],
    ],
  },
  {
    slug: "kane-williamson", name: "Kane Williamson", country: "New Zealand", cc: "NZ", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm off break",
    born: "8 Aug 1990, Tauranga", age: 35, debut: 2010, espnId: "277906", ranks: [3, null, null],
    attrs: [68, 98, 94, 96, 92, 90, 84, 80],
    bio: "The zen master. Williamson's minimal backlift and impeccable judgment have produced 33 Test hundreds and a WTC title.",
    stats: [
      ["Test", 105, 183, 9276, 54.9, 51.8, 33, 37, 251, 30, 40.0, 3.1, 78, 0, "4/44", 90],
      ["ODI", 167, 159, 7000, 49.0, 81.5, 15, 47, 148, 37, 35.0, 5.3, 40, 0, "4/22", 70],
      ["T20I", 93, 90, 2575, 33.0, 123.0, 0, 18, 95, 6, 40.0, 8.0, 30, 0, "2/16", 40],
    ],
    strengths: [
      ["Soft hands & late play", "Plays the ball under his eyes; rarely edges the good-length ball.", "Test avg 54.9"],
      ["Home conditions mastery", "Averages 62 at home with 19 hundreds.", "Home avg 62"],
      ["Conversion rate", "Turns 47% of Test fifties into hundreds.", "Conversion 47%"],
    ],
    weaknesses: [
      ["T20 acceleration", "Struggles to lift beyond 125 SR in the middle overs.", "T20I SR 123"],
      ["Elbow & knee injuries", "Missed significant cricket since 2021 with persistent niggles.", "Missed 30% of Tests"],
    ],
  },
  {
    slug: "trent-boult", name: "Trent Boult", country: "New Zealand", cc: "NZ", role: "Bowler", bat: "Right-hand bat", bowl: "Left-arm fast-medium",
    born: "22 Jul 1989, Rotorua", age: 36, debut: 2011, espnId: "277912", ranks: [null, null, null],
    attrs: [50, 88, 84, 84, 40, 45, 82, 84],
    bio: "The swinging left-armer whose new-ball spells have made him a franchise-league icon and New Zealand's most valuable white-ball bowler.",
    stats: [
      ["Test", 78, 100, 780, 15.0, 80.0, 0, 1, 52, 317, 27.5, 3.0, 55.0, 10, "6/30", 40],
      ["ODI", 114, 45, 200, 10.0, 75.0, 0, 0, 21, 211, 24.0, 5.0, 29.0, 5, "7/34", 40],
      ["T20I", 55, 10, 40, 8.0, 100.0, 0, 0, 12, 74, 21.0, 7.9, 16.0, 0, "4/34", 15],
    ],
    strengths: [
      ["Powerplay inswing", "Most powerplay wickets of any bowler in T20 leagues since 2018.", "PP SR 14"],
      ["Boundary-rider fielding", "Spectacular catcher on the rope.", "82 fielding rating"],
    ],
    weaknesses: [
      ["Middle-over bite", "Threat drops noticeably when the ball stops swinging.", "Econ 8.9 (overs 7-15)"],
      ["Old-ball reverse swing", "Less effective than peers with the older ball.", "Avg 38 with old ball"],
    ],
  },
  {
    slug: "daryl-mitchell", name: "Daryl Mitchell", country: "New Zealand", cc: "NZ", role: "All-rounder", bat: "Right-hand bat", bowl: "Right-arm medium",
    born: "20 May 1991, Hamilton", age: 34, debut: 2019, espnId: "381743", ranks: [9, 8, null],
    attrs: [86, 80, 82, 88, 82, 88, 84, 84],
    bio: "The late bloomer who became New Zealand's rock at No. 5 with a calm head and clean hitting against spin.",
    stats: [
      ["Test", 33, 55, 2400, 45.0, 56.0, 7, 11, 190, 8, 60.0, 3.5, 100, 0, "1/8", 30],
      ["ODI", 55, 50, 2100, 48.0, 92.0, 5, 11, 134, 10, 50.0, 5.8, 52, 0, "2/14", 25],
      ["T20I", 55, 48, 1000, 28.0, 135.0, 0, 4, 72, 6, 45.0, 8.2, 33, 0, "2/27", 25],
    ],
    strengths: [
      ["Playing spin in Asia", "Averages 60+ in India across formats; uses the crease depth superbly.", "Avg 62 in India"],
      ["Pressure absorption", "Rescues collapses — 5 hundreds from 60/4 or worse.", "5 rescue tons"],
    ],
    weaknesses: [
      ["Extreme pace short ball", "Gloves and top-edges genuine 145+ kph bouncers.", "Avg 24 vs 145+ kph"],
      ["Powerplay T20 tempo", "Not a natural powerplay striker.", "PP SR 118"],
    ],
  },
  {
    slug: "babar-azam", name: "Babar Azam", country: "Pakistan", cc: "PK", role: "Batter", bat: "Right-hand bat", bowl: "Right-arm off break",
    born: "15 Oct 1994, Lahore", age: 31, debut: 2015, espnId: "348144", ranks: [null, 5, 9],
    attrs: [74, 96, 88, 84, 88, 86, 80, 84],
    bio: "Pakistan's modern batting jewel — the fastest to 5,000 ODI runs and former No. 1 in ODIs and T20Is simultaneously.",
    stats: [
      ["Test", 59, 108, 4150, 43.0, 54.0, 9, 28, 196, 0, null, null, null, 0, null, 40],
      ["ODI", 130, 127, 6200, 55.0, 88.5, 19, 36, 158, 0, null, null, null, 0, null, 55],
      ["T20I", 128, 121, 4223, 39.8, 129.2, 3, 36, 122, 0, null, null, null, 0, null, 50],
    ],
    strengths: [
      ["Cover drive", "The most aesthetically perfect cover drive in the game — averages 100+ when driving.", "SR 145 cover drive"],
      ["ODI consistency", "Fifty-plus in 43% of ODI innings.", "43% 50+ rate"],
    ],
    weaknesses: [
      ["T20 powerplay tempo", "Anchoring approach costs momentum; PP SR under 120.", "PP SR 117"],
      ["Away nip-backer", "Falls lbw/bowled to balls seaming in during Tests abroad.", "Avg 28 in AUS/SA"],
    ],
  },
  {
    slug: "shaheen-afridi", name: "Shaheen Shah Afridi", country: "Pakistan", cc: "PK", role: "Bowler", bat: "Left-hand bat", bowl: "Left-arm fast",
    born: "6 Apr 2000, Landi Kotal", age: 25, debut: 2018, espnId: "1072470", ranks: [null, 8, 10],
    attrs: [60, 84, 76, 82, 45, 50, 72, 80],
    bio: "The tall left-armer whose first-over inswingers have removed the world's best openers before they've settled.",
    stats: [
      ["Test", 32, 50, 400, 10.0, 60.0, 0, 0, 30, 116, 26.5, 3.3, 48.0, 5, "6/51", 8],
      ["ODI", 66, 30, 250, 12.0, 85.0, 0, 0, 25, 130, 24.0, 5.4, 26.0, 3, "6/35", 15],
      ["T20I", 90, 25, 120, 9.0, 110.0, 0, 0, 20, 115, 22.0, 7.7, 17.0, 0, "4/22", 20],
    ],
    strengths: [
      ["First-over strikes", "Most first-over wickets in T20Is since 2019.", "24 first-over wkts"],
      ["Yorker to right-handers", "Full, fast and swinging in at the base of stumps.", "Death econ 8.1"],
    ],
    weaknesses: [
      ["Post-injury pace drop", "Average pace has dipped 4–5 kph since 2023 knee injury.", "Avg 135 kph (2024)"],
      ["Middle-over economy", "Expensive without swing in the middle phase.", "Econ 9.1 (overs 7-15)"],
    ],
  },
  {
    slug: "rashid-khan", name: "Rashid Khan", country: "Afghanistan", cc: "AF", role: "Bowler", bat: "Right-hand bat", bowl: "Right-arm leg break googly",
    born: "20 Sep 1998, Nangarhar", age: 27, debut: 2015, espnId: "793463", ranks: [null, 4, 2],
    attrs: [78, 90, 96, 90, 55, 60, 82, 88],
    bio: "The greatest T20 bowler of all time. Rashid's fast, flat leg-spin and unreadable googly have conquered every league in the world.",
    stats: [
      ["Test", 6, 10, 140, 14.0, 55.0, 0, 0, 51, 40, 21.0, 3.1, 40.0, 4, "7/137", 2],
      ["ODI", 110, 70, 1300, 20.0, 105.0, 0, 5, 60, 200, 20.5, 4.3, 28.6, 4, "7/18", 30],
      ["T20I", 100, 40, 500, 15.0, 145.0, 0, 0, 48, 170, 13.5, 6.2, 13.1, 2, "5/3", 30],
    ],
    strengths: [
      ["Undetectable googly", "Batters pick the wrong'un less than 40% of the time.", "T20I avg 13.5"],
      ["Middle-over strangler", "Most economical middle-over bowler in T20 history (min 100 games).", "Econ 6.2"],
      ["Lower-order hitting", "Strikes at 145+ from No. 8.", "T20I SR 145"],
    ],
    weaknesses: [
      ["Left-handers sweeping", "Left-handers who sweep hard score at 8.5 an over against him.", "Econ 8.5 vs LHB sweepers"],
      ["Test workload", "Back surgery limits red-ball participation.", "6 Tests in 9 years"],
    ],
  },
  {
    slug: "shakib-al-hasan", name: "Shakib Al Hasan", country: "Bangladesh", cc: "BD", role: "All-rounder", bat: "Left-hand bat", bowl: "Slow left-arm orthodox",
    born: "24 Mar 1987, Magura", age: 38, debut: 2006, espnId: "56143", ranks: [null, null, null],
    attrs: [74, 82, 88, 84, 78, 88, 74, 76],
    bio: "Bangladesh's greatest cricketer and the longest-serving No. 1 ODI all-rounder in history.",
    stats: [
      ["Test", 71, 130, 4609, 37.8, 60.0, 5, 31, 217, 246, 31.7, 2.9, 65.0, 19, "7/36", 26],
      ["ODI", 247, 234, 7570, 37.3, 82.8, 9, 56, 134, 317, 29.4, 4.5, 39.0, 4, "5/29", 60],
      ["T20I", 129, 127, 2551, 23.2, 121.2, 0, 13, 84, 149, 20.9, 6.8, 18.4, 2, "5/20", 30],
    ],
    strengths: [
      ["Dual-threat value", "Only player with 600+ wickets and 14,000 runs in internationals.", "600+ wkts, 14k runs"],
      ["World Cup 2019", "606 runs and 11 wickets — the greatest all-round tournament ever.", "606 runs + 11 wkts"],
    ],
    weaknesses: [
      ["Eyesight & age", "Vision issues have hampered batting since 2023.", "Avg 19 since 2023"],
      ["Pace & bounce", "Struggles against 145+ kph on bouncy tracks.", "Avg 23 in AUS/SA"],
    ],
  },
  {
    slug: "kagiso-rabada", name: "Kagiso Rabada", country: "South Africa", cc: "ZA", role: "Bowler", bat: "Left-hand bat", bowl: "Right-arm fast",
    born: "25 May 1995, Johannesburg", age: 30, debut: 2014, espnId: "550215", ranks: [3, 10, null],
    attrs: [55, 90, 88, 86, 45, 50, 74, 90],
    bio: "The fastest to 300 Test wickets by strike rate — Rabada combines raw pace with a magnificent seam position.",
    stats: [
      ["Test", 70, 100, 1000, 12.0, 60.0, 0, 0, 48, 330, 22.0, 3.4, 39.0, 16, "7/112", 30],
      ["ODI", 105, 45, 400, 12.0, 80.0, 0, 0, 31, 165, 27.5, 5.0, 33.0, 2, "6/16", 25],
      ["T20I", 65, 15, 100, 10.0, 120.0, 0, 0, 22, 75, 24.0, 8.0, 18.0, 0, "3/18", 15],
    ],
    strengths: [
      ["Strike rate", "Best strike rate (39) of any bowler with 300+ Test wickets.", "Test SR 39"],
      ["Wobble seam", "Upright seam at 145 kph produces late deviation both ways.", "Avg 20 with new ball"],
    ],
    weaknesses: [
      ["Discipline/temper", "Suspensions for on-field conduct have cost him matches.", "3 demerit suspensions"],
      ["T20 death overs", "Goes at 10+ in the final four overs.", "Death econ 10.4"],
    ],
  },
  {
    slug: "quinton-de-kock", name: "Quinton de Kock", country: "South Africa", cc: "ZA", role: "Wicketkeeper", bat: "Left-hand bat",
    born: "17 Dec 1992, Johannesburg", age: 33, debut: 2012, espnId: "379143", ranks: [null, null, null],
    attrs: [90, 82, 74, 78, 88, 78, 90, 84],
    bio: "South Africa's most prolific white-ball keeper-batter; four hundreds in the 2023 World Cup.",
    stats: [
      ["Test", 54, 91, 3300, 38.8, 70.1, 6, 22, 141, 0, null, null, null, 0, null, 220],
      ["ODI", 155, 155, 6770, 45.7, 96.6, 21, 30, 178, 0, null, null, null, 0, null, 215],
      ["T20I", 92, 92, 2584, 32.0, 139.0, 1, 15, 100, 0, null, null, null, 0, null, 55],
    ],
    strengths: [
      ["Powerplay boundaries", "Boundary every 5.2 balls in ODI powerplays.", "PP SR 108"],
      ["Wicketkeeping", "Clean glove-work to pace and spin; 400+ intl dismissals.", "400+ dismissals"],
    ],
    weaknesses: [
      ["Spin in middle overs", "Strike rate and average dip against leg-spin.", "Avg 24 vs leg-spin"],
      ["Consistency vs swing", "Nicks off to the ball swinging away early.", "38% dismissals caught behind"],
    ],
  },
  {
    slug: "heinrich-klaasen", name: "Heinrich Klaasen", country: "South Africa", cc: "ZA", role: "Wicketkeeper", bat: "Right-hand bat",
    born: "30 Jul 1991, Pretoria", age: 34, debut: 2018, espnId: "436757", ranks: [null, null, null],
    attrs: [98, 76, 70, 84, 80, 96, 82, 80],
    bio: "The most destructive middle-order hitter in white-ball cricket — 174 off 83 balls against Australia in 2023.",
    stats: [
      ["Test", 4, 8, 104, 13.0, 45.0, 0, 0, 35, 0, null, null, null, 0, null, 10],
      ["ODI", 60, 55, 2141, 43.7, 117.0, 4, 11, 174, 0, null, null, null, 0, null, 60],
      ["T20I", 58, 52, 1000, 25.0, 141.8, 0, 5, 81, 0, null, null, null, 0, null, 30],
    ],
    strengths: [
      ["Spin destroyer", "Strikes at 170+ against spin in T20s — no one hits spin harder.", "SR 172 vs spin"],
      ["Straight six-hitting", "Massive down-the-ground range from a still base.", "6 every 9 balls (ODI)"],
    ],
    weaknesses: [
      ["Wide yorkers", "Struggles to access the off-side against wide yorkers at the death.", "SR 98 vs wide yorker"],
      ["Red-ball technique", "Test career stalled at an average of 13.", "Test avg 13"],
    ],
  },
  {
    slug: "nicholas-pooran", name: "Nicholas Pooran", country: "West Indies", cc: "TT", role: "Wicketkeeper", bat: "Left-hand bat",
    born: "2 Oct 1995, Couva", age: 30, debut: 2016, espnId: "604302", ranks: [null, null, 6],
    attrs: [96, 72, 62, 78, 84, 88, 78, 82],
    bio: "West Indies' six-hitting machine — set the record for most T20 sixes in a calendar year in 2024.",
    stats: [
      ["ODI", 61, 55, 1983, 39.7, 99.0, 3, 11, 118, 0, null, null, null, 0, null, 40],
      ["T20I", 106, 98, 2275, 26.1, 136.4, 0, 13, 98, 0, null, null, null, 0, null, 45],
    ],
    strengths: [
      ["Six-hitting vs spin", "Deposits spinners over long-on with a short, brutal swing.", "SR 165 vs spin"],
      ["Powerplay promotion", "Averages 34 at SR 160 when opening in T20.", "Opening SR 160"],
    ],
    weaknesses: [
      ["Consistency", "Median T20I score is just 17.", "Median 17"],
      ["Back-of-a-length pace", "Cramped by 140+ kph into the body.", "Avg 18 vs hard length"],
    ],
  },
  {
    slug: "wanindu-hasaranga", name: "Wanindu Hasaranga", country: "Sri Lanka", cc: "LK", role: "All-rounder", bat: "Right-hand bat", bowl: "Right-arm leg break",
    born: "29 Jul 1997, Galle", age: 28, debut: 2017, espnId: "784379", ranks: [null, 6, 3],
    attrs: [80, 82, 84, 80, 60, 65, 80, 82],
    bio: "Sri Lanka's leg-spinning talisman with the best T20I bowling average of any spinner with 100+ wickets.",
    stats: [
      ["Test", 4, 7, 196, 28.0, 60.0, 0, 1, 59, 4, 82.0, 3.8, 130.0, 0, "1/34", 1],
      ["ODI", 60, 40, 700, 24.0, 105.0, 0, 3, 68, 90, 24.0, 5.3, 27.0, 2, "5/79", 20],
      ["T20I", 70, 40, 400, 14.0, 120.0, 0, 0, 42, 110, 15.0, 7.1, 12.7, 1, "4/9", 22],
    ],
    strengths: [
      ["Googly to left-handers", "Best wrong'un in the game after Rashid; averages 11 vs LHB.", "Avg 11 vs LHB"],
      ["Wicket-taking in Asia", "Strike rate under 13 in T20Is in Asia.", "SR 12.7"],
    ],
    weaknesses: [
      ["Economy outside Asia", "Goes at 8.5+ in Australia and England.", "Econ 8.6 (AUS/ENG)"],
      ["Injury interruptions", "Hamstring issues cost him multiple series.", "Missed 25% of games"],
    ],
  },
];

export const TEAMS = Array.from(new Set(SEED_PLAYERS.map((p) => p.country)));
