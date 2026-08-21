"""Resolve bowling styles and batting hands for the players in the corpus.

Cricsheet ball-by-ball data names the bowler but never says what kind of bowler
they are, and that single attribute is the hinge the whole matchup analysis
turns on. This module fills it in, from cheapest source to most expensive:

1. ``data/styles.csv`` in the repo - a curated file, always consulted first,
   and the place to put corrections. It is authoritative: nothing overwrites it.
2. ``--styles-file`` - your own CSV (a licensed feed, a club database).
3. ``--enrich espncricinfo`` - one profile request per unresolved player,
   joined via the Cricsheet register's ``key_cricinfo`` column. Opt-in,
   robots-gated, rate-limited and cached.

Whatever is still unresolved simply stays blank: those deliveries drop out of
the bowling-type splits and are reported in the build summary, rather than
being guessed at.
"""
from __future__ import annotations

import csv
import json
import logging
from pathlib import Path

from . import net
from .config import CACHE_DIR, ROOT
from .styles import normalise_batting_style, normalise_bowling_style

log = logging.getLogger(__name__)

CURATED = ROOT / "data" / "styles.csv"
# Generated from a published player-metadata table (see sources/playermeta.py).
# Read before the curated file so hand-checked corrections still win.
GENERATED = ROOT / "data" / "player_styles.csv"
STYLE_CACHE = CACHE_DIR / "styles.json"

FIELDS = ["name", "bowling_type", "batting_hand", "role", "country",
          "cricinfo_id", "source"]


def load_csv(path: Path) -> dict[str, dict]:
    """Read a styles CSV keyed on the Cricsheet player name."""
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        # Strip the explanatory header. csv.DictReader would otherwise take the
        # first comment line as the field names and silently read nothing.
        rows = (line for line in fh if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            out[name] = {
                "bowlingType": normalise_bowling_style(row.get("bowling_type", ""))
                               or (row.get("bowling_type") or "").strip(),
                "battingHand": normalise_batting_style(row.get("batting_hand", ""))
                               or (row.get("batting_hand") or "").strip(),
                "role": (row.get("role") or "").strip(),
                "country": (row.get("country") or "").strip(),
                "cricinfoId": (row.get("cricinfo_id") or "").strip(),
                "source": (row.get("source") or path.name).strip(),
            }
    return out


def save_csv(path: Path, records: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        for name in sorted(records):
            r = records[name]
            writer.writerow({
                "name": name,
                "bowling_type": r.get("bowlingType", ""),
                "batting_hand": r.get("battingHand", ""),
                "role": r.get("role", ""),
                "country": r.get("country", ""),
                "cricinfo_id": r.get("cricinfoId", ""),
                "source": r.get("source", ""),
            })


def load_cache() -> dict[str, dict]:
    if STYLE_CACHE.exists():
        try:
            return json.loads(STYLE_CACHE.read_text())
        except json.JSONDecodeError:
            log.warning("style cache corrupt; ignoring")
    return {}


def save_cache(records: dict[str, dict]) -> None:
    STYLE_CACHE.parent.mkdir(parents=True, exist_ok=True)
    STYLE_CACHE.write_text(json.dumps(records, indent=1, sort_keys=True))


def resolve(names: set[str], registry: dict[str, str],
            *, extra_file: Path | None = None,
            use_cricinfo: bool = False,
            limit: int | None = None,
            people: dict[str, dict] | None = None) -> tuple[dict[str, dict], dict]:
    """Build a name -> attributes map covering as many of ``names`` as possible.

    ``registry`` maps player name to Cricsheet person id, which is how we reach
    the Cricinfo id in the people register.
    """
    records: dict[str, dict] = {}
    records.update(load_cache())
    records.update(load_csv(GENERATED))
    if extra_file:
        records.update(load_csv(extra_file))
    # The curated file wins over everything, including anything we scraped
    # earlier, so a hand-checked correction is never silently undone.
    records.update(load_csv(CURATED))

    stats = {"requested": len(names), "fromCache": 0, "fromCurated": 0,
             "fromCricinfo": 0, "unresolved": 0, "blocked": False, "errors": 0}

    unresolved = {n for n in names if not records.get(n, {}).get("bowlingType")}
    stats["fromCache"] = len(names) - len(unresolved)

    if use_cricinfo and unresolved:
        people = people if people is not None else {}
        if not people:
            try:
                from .sources.cricsheet import load_register
                people = load_register()
            except (net.Blocked, net.FetchError) as exc:
                log.warning("could not load the Cricsheet register: %s", exc)
                people = {}

        from .sources import espncricinfo

        targets = sorted(unresolved)
        if limit:
            targets = targets[:limit]
        for name in targets:
            person_id = registry.get(name)
            cricinfo_id = ""
            if person_id and person_id in people:
                cricinfo_id = people[person_id].get("key_cricinfo", "")
            if not cricinfo_id:
                continue
            try:
                profile = espncricinfo.fetch_profile(cricinfo_id)
            except net.Blocked as exc:
                log.error("stopping Cricinfo enrichment: %s", exc)
                stats["blocked"] = True
                break
            except net.FetchError as exc:
                log.warning("could not fetch %s (%s): %s", name, cricinfo_id, exc)
                stats["errors"] += 1
                continue
            if not profile.bowling_type and not profile.batting_hand:
                continue
            records[name] = {
                "bowlingType": profile.bowling_type,
                "battingHand": profile.batting_hand,
                "role": profile.playing_role,
                "country": profile.country,
                "cricinfoId": str(cricinfo_id),
                "fullName": profile.full_name,
                "born": profile.born,
                "source": "espncricinfo",
            }
            stats["fromCricinfo"] += 1
        save_cache(records)

    resolved = {n: records[n] for n in names if n in records}
    stats["unresolved"] = sum(1 for n in names
                              if not resolved.get(n, {}).get("bowlingType"))
    stats["fromCurated"] = sum(1 for r in resolved.values()
                               if r.get("source", "").endswith("styles.csv"))
    return resolved, stats


def split_maps(records: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """Convenience: (name -> bowling type, name -> batting hand)."""
    styles = {n: r["bowlingType"] for n, r in records.items() if r.get("bowlingType")}
    hands = {n: r["battingHand"] for n, r in records.items() if r.get("battingHand")}
    return styles, hands
