# Criclysis live analysis API

A Flask service that answers: given a player, what does their game look like,
where are they vulnerable, and how would you bowl at them?

It combines three inputs:

| Source | Provides | Required? |
|---|---|---|
| Criclysis dataset (`web/data`) | Historical ball-by-ball splits — the evidence | No, but strongly recommended |
| CricketData (cricapi.com) | Live match state and current innings | No |
| Google Gemini | Synthesis into playstyle / weaknesses / tactics | No |

Each degrades independently. With none of them you get a clearly-labelled
placeholder; with only the dataset you get real computed weaknesses and no
prose; with all three you get the full read.

**The dataset is what makes this analysis rather than guesswork.** A language
model shown three overs of commentary will produce confident, plausible,
unfounded claims. Shown that a batter averages 30.1 against the new ball off
2,081 balls, it has something to reason about. `load_grounding()` is the
function that does this, and it is the most important twenty lines in the file.

## Endpoints

```
GET  /healthz                        liveness + configuration report
GET  /api/live-matches               matches in progress
GET  /api/player-analysis?player=…   the analysis
POST /api/player-analysis            {"player": "...", "match_id": "..."}
```

`player` accepts most name forms — `Virat Kohli`, `V Kohli` and `kohli` all
resolve, via a first-initial-plus-surname fallback.

### Response

```json
{
  "player_name": "V Kohli",
  "current_stats": { "career": {...}, "live_innings": {...}, "match": {...} },
  "playstyle":      { "summary": "...", "tempo": "...", "scoring_areas": [] },
  "weaknesses":     [ { "title", "detail", "evidence", "confidence" } ],
  "tactical_advice":[ { "phase", "recommendation", "rationale" } ],
  "meta": { "source", "grounded", "live_data", "degraded", "notes", "disclaimer" }
}
```

Always check `meta.degraded` and `meta.source` before presenting results as
authoritative. `source` is one of `gemini` (AI synthesis), `computed`
(pipeline-computed splits, no AI) or `fallback` (nothing available).

## Local development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add your keys
export $(grep -v '^#' .env | xargs)
python app.py                 # http://localhost:5000/healthz
```

## Deploying to Render

Either commit `render.yaml` and use **New → Blueprint**, or create a Web
Service by hand with root directory `backend`, build `pip install -r
requirements.txt`, and the start command from the `Procfile`.

Set `CRICKETDATA_API_KEY` and `GEMINI_API_KEY` in the dashboard — never in
source control.

### The free tier sleeps

Render's free plan suspends a service after ~15 minutes without traffic, and
the next request pays a cold start of roughly 50 seconds. This is not
"24/7 automatically". Options, honestly ranked:

1. **Accept it.** The frontend snippet already warns the user on first load.
2. **Ping `/healthz` every 10 minutes** from an external cron (UptimeRobot,
   cron-job.org). Keeps it warm, though free Render plans have a monthly hours
   budget that continuous pinging will consume.
3. **Pay for the smallest paid instance** if it genuinely needs to be always-on.

## Quotas

CricketData's free tier is roughly 100 requests/day — a handful of page loads
without caching. Hence `CACHE_TTL_LIVE` (60s) and `CACHE_TTL_ANALYSIS` (300s),
and a per-IP rate limit. Raise the TTLs before raising the plan.

Gemini's free tier is generous but not unlimited; a failure there degrades to
computed splits rather than an error.
