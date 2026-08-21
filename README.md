# Cricket Analytics

A cricket analytics website built from **ball-by-ball data**: career records, an
automatic read on each player's strengths and weaknesses, interactive charts and
tables for every split, and a strategy planner that produces a bowling plan
against any batter or any side.

Two parts:

| | |
|---|---|
| **`pipeline/`** | A Python data pipeline that downloads ball-by-ball match data, aggregates it into per-player splits, runs the strengths/weaknesses analysis and exports JSON. Standard library only — no dependencies to install. |
| **`web/`** | A static site that reads that JSON. No build step, no framework, no CDN. Open it with any web server. |

## Quick start

```bash
# 1. Build the bundled demo dataset (no network needed, ~20 seconds)
make seed

# 2. Serve the site
make serve            # http://localhost:8000
```

That gives you a fully working site immediately, running on a **simulated**
dataset (see [Demo data](#demo-data)). To load real cricket data:

```bash
make data             # downloads Cricsheet archives, then aggregates and analyses
```

## What it does

**Player profiles** — career totals, batting average and strike rate against
each of the ten bowling types, splits by phase of the innings, by stage of the
batter's own innings, by opposition, country, ground and season, the mix of
dismissal modes, head-to-head records against individual bowlers, and an
innings-by-innings log with a rolling form line.

**Strengths and weaknesses** — generated, not written. Each finding names the
split, the player's figure in it, their own overall figure, the cohort median,
a percentile, a sample size and a confidence level. See
[the method](#how-a-strength-or-weakness-is-decided).

**Strategy planner** — pick a batter and a bowling side and get a ranked list of
which bowler to use and when, a phase-by-phase plan, a read on what the batter's
dismissal mix implies, and the same evidence read from the batter's end. Or pick
two full sides and get a matchup matrix and an over-by-over bowling allocation.

**Compare and leaderboards** — two careers side by side across every shared
split; leaderboards on any metric with the qualification threshold as a visible
control rather than a footnote.

Every chart has a table view and a CSV export.

## Where the data comes from

| Source | What it provides | Licence | Default |
|---|---|---|---|
| [Cricsheet](https://cricsheet.org) | Ball-by-ball data for every delivery: batter, bowler, runs, extras, dismissal | CC BY 4.0 | **Used** |
| [ESPNcricinfo](https://www.espncricinfo.com) | Player profile metadata — bowling style, batting hand, playing role | Proprietary | Opt-in |
| [ICC](https://www.icc-cricket.com) | Official team and player rankings | Proprietary | Opt-in |

**Cricsheet is the source that matters.** Scorecard aggregates can tell you a
batter averages 48; only ball-by-ball data can tell you they average 21 against
left-arm wrist spin in the middle overs, which is what this site exists to say.
Cricsheet publishes it openly, in bulk, under CC BY 4.0. **Any deployment of
this site must credit Cricsheet** — the generated About page does so
automatically.

### About the other two

Cricsheet does not record what *kind* of bowler each bowler is, and that single
attribute is the hinge the whole matchup analysis turns on. Three ways to supply
it, cheapest first:

1. **`data/styles.csv`** — a curated file in this repo, read first and never
   overridden. Corrections belong here.
2. **`--styles-file yours.csv`** — your own mapping from a licensed feed or a
   club database.
3. **`--enrich espncricinfo`** — one profile request per unresolved player,
   joined to Cricinfo via the `key_cricinfo` column of the Cricsheet register.

Option 3 is **opt-in and never runs by default**. When it does run it checks
`robots.txt` for every URL before requesting it and stops if disallowed, waits at
least two seconds between requests (or longer if `Crawl-delay` says so),
identifies itself honestly, caches every response so a rebuild costs zero
requests, and fetches profile attributes only. ESPNcricinfo and the ICC are not
open data — treat their terms of use as your responsibility, and note that
everything else on the site works without them.

If enrichment is blocked or you skip it, unresolved bowlers simply drop out of
the bowling-type splits. Every other statistic is unaffected, and the build
summary and the Method page both report how many bowlers are missing a style.

## How a strength or weakness is decided

A raw split is not a finding. "Averages 22 against left-arm orthodox" only means
something once you know what that player averages overall, and how far other
comparable players deviate from *their* baselines against the same bowling. So a
claim has to clear three bars:

1. **Sample size.** A batting split needs 150 balls to be eligible as a claim and
   60 to be displayed at all; bowling splits need 240 and 90.
2. **Effect against the player's own baseline.** At least a 4% departure from
   what that player does overall. Small samples are shrunk towards that baseline
   first, so a batter dismissed twice in 60 balls by leg spin does not acquire a
   catastrophic weakness.
3. **Position in the cohort — measured relatively.** Above the 70th or below the
   30th percentile, where that percentile is computed on the split's **ratio to
   the player's own baseline**, not on the raw number.

Step 3 is the one that matters. Scored on absolute numbers, a moderate batter
sits below the cohort median against every type of bowling, and the site would
announce six "weaknesses" that only restate that they are a moderate batter.
Scored relatively, the question becomes the one worth asking: relative to how
this player normally bats, is leg spin a problem for them by more than it is a
problem for everyone else? Switching to the relative measure raised recovery of
known, planted weaknesses in the test corpus from 42% to 73%.

## What it cannot tell you

- **No ball tracking.** Length, line, speed, swing and turn are not in any
  openly licensed ball-by-ball dataset. Nothing here claims a batter has a
  "short ball problem". Where the strategy planner mentions the stumps, that is
  inferred from the *mix of dismissal modes* — bowled and lbw against caught —
  which the data does record, and it says so.
- **No shot or field data.** Field-setting advice is general, not zonal.
- **Conditions are not controlled for.** Country and venue splits are
  descriptive: they reflect the pitches, attacks and eras encountered.
- **Bowling style is one label per career.** A bowler who changed method
  mid-career is flattened to a single type.
- **A percentile is not a verdict.** The bottom 10% of a cohort of international
  cricketers is still a very high standard.

## Demo data

Out of the box the site loads a **simulated** dataset. Every player, team,
venue and number in it is fictional, generated by a seeded ball-by-ball match
simulator (`pipeline/simulate.py`). The site shows a standing, undismissable
banner while that dataset is loaded, and the manifest carries a
`provenance.dataset: "demo"` flag that drives it.

It exists for two reasons. It makes the site explorable immediately without a
200 MB download. And because the simulator *plants* a known strength and
weakness in each batter, it lets the analysis engine be tested against ground
truth — the demo dataset runs through exactly the same parser, aggregator,
analyser and exporter as real data, so it is a genuine end-to-end exercise of the
pipeline rather than a fixture.

The simulator is calibrated so batting averages, strike rates, bowling averages
and economy rates all land near their real-world medians in each format. It is
byte-for-byte reproducible.

`make data` replaces every file in `web/data` with real data.

## Commands

```
make seed        Build the simulated demo dataset (no network)
make fetch       Download the Cricsheet ball-by-ball archives
make build       Aggregate, analyse and export the real dataset
make data        fetch + build
make enrich      Resolve bowling styles from ESPNcricinfo (opt-in, robots-gated)
make rankings    Fetch ICC player rankings (opt-in)
make serve       Serve web/ on http://localhost:8000
make check       Verify the dataset the site will load
make test        Run every test
make clean       Remove the generated dataset
```

The CLI takes more options than the Makefile targets expose:

```bash
python -m pipeline build --formats test odi t20i ipl --limit-matches 500 --pretty
python -m pipeline build --enrich espncricinfo --limit 200
python -m pipeline fetch --formats t20i --refresh
```

`--limit-matches` is the one to reach for first: it processes only the first N
matches, which turns a full build into a thirty-second trial run.

## Project layout

```
pipeline/
  cli.py           command line entry point
  net.py           cached, rate-limited, robots-aware HTTP
  sources/
    cricsheet.py   ball-by-ball archives (primary source)
    espncricinfo.py  profile metadata and Statsguru (opt-in)
    icc.py         rankings (opt-in)
  aggregate.py     streams matches into per-player splits
  metrics/         the batting and bowling accumulators
  analyze.py       cohort percentiles -> strengths and weaknesses
  export.py        writes web/data
  simulate.py      the ball-by-ball match simulator behind the demo dataset
  styles.py        normalises free-text bowling styles onto a fixed taxonomy

web/
  index.html
  assets/js/
    charts/        an SVG chart library (bar, line, scatter, radar, heatmap, ...)
    lib/           data store, strategy engine, sortable tables, formatting
    views/         one module per page
  data/            generated JSON

data/styles.csv    curated bowling styles - the authoritative override
tests/             Python pipeline tests and JavaScript analysis tests
```

## Design notes

**Streaming, not dataframes.** A full men's international corpus is around ten
million deliveries. The aggregator never holds more than one match in memory, so
a full build runs on an ordinary laptop with no scientific Python stack.

**No build step on the web side.** The site is ES modules and hand-written SVG
charts. Clone it, serve the folder, done. It also means a strict CSP is
satisfiable and there is no supply chain to audit.

**Per-player files.** `players.json` is a small index for search and
leaderboards; the detailed record for one player is fetched only when their
profile is opened.

**Every chart has a table.** Partly for accessibility — three of the light-mode
series colours sit below 3:1 contrast, and the palette's relief rule requires
visible labels or a table view — and partly because anyone who cares enough to
read a cricket analytics site eventually wants the numbers.

## Deploying

The site is static, so any host works. To publish with GitHub Pages, enable
Pages for the repository with **Source: GitHub Actions**; the workflow in
`.github/workflows/pages.yml` builds the dataset and deploys `web/`.

## Licence

The code in this repository is MIT licensed. The data is not: Cricsheet data is
CC BY 4.0 and requires attribution, and ESPNcricinfo and ICC content remains
subject to their own terms.
