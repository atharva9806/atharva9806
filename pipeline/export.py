"""Write the aggregates out as the JSON the website reads.

Layout
------
manifest.json       build metadata, source credits, per-format counts
players.json        lightweight index: everything search and leaderboards need
players/<id>.json   the full record for one player, fetched on demand
cohorts.json        cohort quartiles per format, for distribution context
teams.json          squads by team and format
venues.json         ground-level scoring context
rankings.json       ICC rankings (only when the enrichment step ran)

Splitting the per-player detail into its own file keeps the first page load in
the low hundreds of kilobytes even with a few thousand players indexed.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from .config import ALL_FORMATS, BOWLING_TYPES, PHASES, SOURCES, THRESHOLDS
from .metrics.base import dict_of_splits
from .analyze import Cohort, analyse_player, cohort_reference

log = logging.getLogger(__name__)

T = THRESHOLDS
SLUG_RE = re.compile(r"[^a-z0-9]+")

# Splits below this many balls are dropped from the export entirely: they are
# noise, and shipping them just inflates the payload.
EXPORT_MIN_BALLS = 24
EXPORT_MIN_BALLS_BOWL = 36
# Head-to-head records are only interesting once there is a real contest.
H2H_MIN_BALLS = 30
H2H_MAX = 40


def slugify(name: str, player_id: str) -> str:
    base = SLUG_RE.sub("-", name.lower()).strip("-")
    return f"{base}-{player_id[:8]}" if base else player_id


def _write(path: Path, payload, *, pretty: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2 if pretty else None,
                      separators=None if pretty else (",", ":"),
                      ensure_ascii=False, sort_keys=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def _top_h2h(splits, limit: int = H2H_MAX, min_balls: int = H2H_MIN_BALLS) -> dict:
    ranked = sorted(
        ((k, v) for k, v in splits.items() if v.balls >= min_balls),
        key=lambda kv: kv[1].balls, reverse=True)[:limit]
    return {k: v.to_dict() for k, v in ranked}


def _career_milestones(innings: list) -> dict:
    """Fifties, hundreds, highest score and the not-out count."""
    fifties = hundreds = one_fifties = doubles = not_outs = 0
    highest = 0
    highest_not_out = False
    for inn in innings:
        runs = inn.runs
        if runs >= 200:
            doubles += 1
        if runs >= 150:
            one_fifties += 1
        if runs >= 100:
            hundreds += 1
        elif runs >= 50:
            fifties += 1
        if not inn.out:
            not_outs += 1
        if runs > highest:
            highest, highest_not_out = runs, not inn.out
    return {
        "fifties": fifties, "hundreds": hundreds,
        "oneFifties": one_fifties, "doubleHundreds": doubles,
        "notOuts": not_outs, "highest": highest, "highestNotOut": highest_not_out,
    }


def _bowling_best(innings: list) -> dict:
    best = {"wickets": 0, "runs": 0}
    five_fors = four_fors = 0
    for inn in innings:
        if inn.wickets >= 5:
            five_fors += 1
        elif inn.wickets >= 4:
            four_fors += 1
        if (inn.wickets > best["wickets"] or
                (inn.wickets == best["wickets"] and inn.runs < best["runs"])):
            best = {"wickets": inn.wickets, "runs": inn.runs}
    return {"best": best, "fiveWickets": five_fors, "fourWickets": four_fors}


def build_player_record(record, analysis: dict, meta: dict, fmt: str) -> dict:
    """Full detail for one player in one format."""
    bat = record.bat_overall
    bowl = record.bowl_overall
    innings = sorted(record.bat_innings, key=lambda i: i.date)
    bowl_innings = sorted(record.bowl_innings, key=lambda i: i.date)

    payload: dict = {
        "format": fmt,
        "formatLabel": ALL_FORMATS[fmt]["label"],
        "strengths": analysis["strengths"],
        "weaknesses": analysis["weaknesses"],
        "profile": analysis["profile"],
    }

    if record.has_batting():
        payload["batting"] = {
            "overall": bat.to_dict(),
            "milestones": _career_milestones(innings),
            "byType": dict_of_splits(record.bat_by_type, EXPORT_MIN_BALLS),
            "byFamily": dict_of_splits(record.bat_by_family, EXPORT_MIN_BALLS),
            "byPhase": dict_of_splits(record.bat_by_phase, EXPORT_MIN_BALLS),
            "byEntry": dict_of_splits(record.bat_by_entry, EXPORT_MIN_BALLS),
            "byTypePhase": dict_of_splits(record.bat_by_type_phase, EXPORT_MIN_BALLS),
            "byOpposition": dict_of_splits(record.bat_by_opposition, EXPORT_MIN_BALLS),
            "byCountry": dict_of_splits(record.bat_by_country, EXPORT_MIN_BALLS),
            "byVenue": dict_of_splits(record.bat_by_venue, EXPORT_MIN_BALLS * 2),
            "byHome": dict_of_splits(record.bat_by_home, EXPORT_MIN_BALLS),
            "byInningsNo": dict_of_splits(record.bat_by_innings_no, EXPORT_MIN_BALLS),
            "byChase": dict_of_splits(record.bat_by_chase, EXPORT_MIN_BALLS),
            "byYear": dict_of_splits(record.bat_by_year, 0),
            "byPosition": dict_of_splits(record.bat_by_position, EXPORT_MIN_BALLS),
            "dismissals": dict(record.dismissals),
            "dismissedByType": dict(record.dismissed_by_type),
            "vsBowler": _top_h2h(record.vs_bowler),
            "innings": [i.to_dict() for i in innings],
        }

    if record.has_bowling():
        payload["bowling"] = {
            "overall": bowl.to_dict(),
            "milestones": _bowling_best(bowl_innings),
            "byHand": dict_of_splits(record.bowl_by_hand, EXPORT_MIN_BALLS_BOWL),
            "byPhase": dict_of_splits(record.bowl_by_phase, EXPORT_MIN_BALLS_BOWL),
            "byOpposition": dict_of_splits(record.bowl_by_opposition, EXPORT_MIN_BALLS_BOWL),
            "byCountry": dict_of_splits(record.bowl_by_country, EXPORT_MIN_BALLS_BOWL),
            "byHome": dict_of_splits(record.bowl_by_home, EXPORT_MIN_BALLS_BOWL),
            "byInningsNo": dict_of_splits(record.bowl_by_innings_no, EXPORT_MIN_BALLS_BOWL),
            "byYear": dict_of_splits(record.bowl_by_year, 0),
            "wicketKinds": dict(record.wicket_kinds),
            "vsBatter": _top_h2h(record.vs_batter, min_balls=H2H_MIN_BALLS),
            "innings": [i.to_dict() for i in bowl_innings],
        }

    return payload


def index_entry(player_id: str, name: str, meta: dict,
                per_format: dict[str, dict]) -> dict:
    """One row in players.json - small enough to ship thousands of them."""
    formats = {}
    for fmt, payload in per_format.items():
        row: dict = {}
        if "batting" in payload:
            b = payload["batting"]["overall"]
            row["bat"] = {
                "inns": b["innings"], "runs": b["runs"], "balls": b["balls"],
                "avg": b["avg"], "sr": b["sr"],
                "hs": payload["batting"]["milestones"]["highest"],
                "100s": payload["batting"]["milestones"]["hundreds"],
                "50s": payload["batting"]["milestones"]["fifties"],
            }
        if "bowling" in payload:
            w = payload["bowling"]["overall"]
            row["bowl"] = {
                "inns": w["innings"], "wkts": w["wickets"], "balls": w["balls"],
                "runs": w["runs"], "avg": w["avg"], "econ": w["econ"], "sr": w["sr"],
                "5w": payload["bowling"]["milestones"]["fiveWickets"],
            }
        row["strengths"] = len(payload.get("strengths", []))
        row["weaknesses"] = len(payload.get("weaknesses", []))
        if row:
            formats[fmt] = row

    return {
        "id": player_id,
        "slug": meta.get("slug", player_id),
        "name": name,
        "fullName": meta.get("fullName", name),
        "teams": meta.get("teams", []),
        "country": meta.get("country", ""),
        "role": meta.get("role", ""),
        "battingHand": meta.get("battingHand", ""),
        "bowlingType": meta.get("bowlingType", ""),
        "bowlingLabel": BOWLING_TYPES.get(meta.get("bowlingType", ""), {}).get("label", ""),
        "born": meta.get("born", ""),
        "debut": meta.get("debut", ""),
        "lastPlayed": meta.get("lastPlayed", ""),
        "cricinfoId": meta.get("cricinfoId", ""),
        "formats": formats,
    }


def export_all(aggregators: dict, metadata: dict, out_dir: Path,
               *, rankings: list | None = None, provenance: dict | None = None,
               pretty: bool = False) -> dict:
    """Write every JSON file the site needs. Returns a build summary."""
    out_dir.mkdir(parents=True, exist_ok=True)
    players_dir = out_dir / "players"
    players_dir.mkdir(parents=True, exist_ok=True)
    for stale in players_dir.glob("*.json"):
        stale.unlink()

    cohorts = {fmt: Cohort(fmt, agg.players) for fmt, agg in aggregators.items()}

    # name -> {fmt: payload}
    by_player: dict[str, dict[str, dict]] = {}
    names: dict[str, str] = {}
    ids: dict[str, str] = {}
    teams_by_format: dict[str, dict[str, set]] = {}

    for fmt, agg in aggregators.items():
        cohort = cohorts[fmt]
        teams_by_format[fmt] = {}
        for name, record in agg.players.items():
            if not (record.has_batting() or record.has_bowling()):
                continue
            analysis = analyse_player(record, cohort, fmt)
            payload = build_player_record(record, analysis, metadata.get(name, {}), fmt)
            by_player.setdefault(name, {})[fmt] = payload
            names[name] = name
            ids[name] = record.player_id
            for team in record.teams:
                if team:
                    teams_by_format[fmt].setdefault(team, set()).add(name)

    index: list[dict] = []
    total_bytes = 0
    for name, per_format in by_player.items():
        player_id = ids[name]
        meta = dict(metadata.get(name, {}))
        meta.setdefault("teams", sorted({t for fmt in per_format
                                         for t in aggregators[fmt].players[name].teams if t}))
        spans = [aggregators[fmt].players[name].career_span() for fmt in per_format]
        starts = [s for s, _e in spans if s]
        ends = [e for _s, e in spans if e]
        meta["debut"] = min(starts) if starts else ""
        meta["lastPlayed"] = max(ends) if ends else ""
        slug = slugify(name, player_id)
        meta["slug"] = slug

        total_bytes += _write(players_dir / f"{slug}.json", {
            "id": player_id,
            "slug": slug,
            "name": name,
            "meta": {k: v for k, v in meta.items() if k != "slug"},
            "formats": per_format,
        }, pretty=pretty)
        index.append(index_entry(player_id, name, meta, per_format))

    index.sort(key=lambda r: (-max((f.get("bat", {}).get("runs", 0)
                                    for f in r["formats"].values()), default=0),
                              r["name"]))
    _write(out_dir / "players.json", {"players": index}, pretty=pretty)

    # --- teams -----------------------------------------------------------
    teams_payload: dict[str, dict] = {}
    for fmt, teams in teams_by_format.items():
        for team, squad in teams.items():
            entry = teams_payload.setdefault(team, {"name": team, "formats": {}})
            ranked = sorted(
                squad,
                key=lambda n: -(by_player[n][fmt].get("batting", {})
                                .get("overall", {}).get("runs", 0)
                                + 20 * by_player[n][fmt].get("bowling", {})
                                .get("overall", {}).get("wickets", 0)))
            entry["formats"][fmt] = [
                {"name": n, "slug": slugify(n, ids[n])} for n in ranked[:40]]
    _write(out_dir / "teams.json", {"teams": teams_payload}, pretty=pretty)

    # --- venues ----------------------------------------------------------
    venues: dict[str, dict] = {}
    for fmt, agg in aggregators.items():
        for name, v in agg.venues.items():
            entry = venues.setdefault(name, {
                "name": name, "city": v["city"], "country": v["country"],
                "formats": {}})
            balls = v["balls"] or 1
            entry["formats"][fmt] = {
                "matches": v["matches"],
                "runsPerOver": round(6.0 * v["runs"] / balls, 2),
                "ballsPerWicket": round(balls / v["wickets"], 1) if v["wickets"] else None,
            }
    _write(out_dir / "venues.json", {"venues": venues}, pretty=pretty)

    # --- cohort reference ------------------------------------------------
    _write(out_dir / "cohorts.json",
           {fmt: cohort_reference(c) for fmt, c in cohorts.items()}, pretty=pretty)

    if rankings:
        _write(out_dir / "rankings.json", {"rankings": rankings}, pretty=pretty)

    # --- manifest --------------------------------------------------------
    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "playerCount": len(index),
        "formats": {fmt: {**ALL_FORMATS[fmt], **agg.summary()}
                    for fmt, agg in aggregators.items()},
        "phases": {fmt: [{"key": k, "from": s, "to": e, "label": lbl}
                         for k, s, e, lbl in PHASES.get(fmt, PHASES["odi"])]
                   for fmt in aggregators},
        "bowlingTypes": BOWLING_TYPES,
        "thresholds": {
            "minBallsSplit": T.min_balls_split,
            "minBallsClaim": T.min_balls_claim,
            "minBallsCohort": T.min_balls_cohort,
            "minBallsBowledSplit": T.min_balls_bowled_split,
            "minBallsBowledClaim": T.min_balls_bowled_claim,
            "minBallsBowledCohort": T.min_balls_bowled_cohort,
            "strengthPercentile": T.strength_pct,
            "weaknessPercentile": T.weakness_pct,
        },
        "sources": SOURCES,
        "provenance": provenance or {},
    }
    _write(out_dir / "manifest.json", manifest, pretty=True)

    return {
        "players": len(index),
        "playerFileBytes": total_bytes,
        "formats": list(aggregators),
    }
