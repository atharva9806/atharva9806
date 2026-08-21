"""Command line entry point.

    python -m pipeline fetch    --formats test odi t20i
    python -m pipeline enrich   --source espncricinfo
    python -m pipeline build    --formats test odi t20i
    python -m pipeline rankings
    python -m pipeline all
    python -m pipeline seed     # generate the bundled demo dataset

``build`` is the one that matters: it streams the downloaded archives, fills the
aggregates, runs the strengths/weaknesses analysis and writes web/data.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

from . import net
from .aggregate import Aggregator
from .config import ALL_FORMATS, FORMATS, WEB_DATA_DIR
from .enrich import resolve, split_maps
from .export import export_all
from .sources import cricsheet

log = logging.getLogger("pipeline")


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )


# ---------------------------------------------------------------------------
def cmd_fetch(args) -> int:
    failures = 0
    for fmt in args.formats:
        try:
            path = cricsheet.download_archive(
                fmt, use_cache=not args.refresh,
                allow_mirror=not getattr(args, "no_mirror", False))
            size = path.stat().st_size / 1e6
            log.info("%-5s %s (%.1f MB)", fmt, path, size)
        except net.Blocked as exc:
            log.error("blocked by robots.txt: %s", exc)
            failures += 1
        except net.FetchError as exc:
            log.error("could not fetch %s: %s", fmt, exc)
            failures += 1
    return 1 if failures else 0


def cmd_rankings(args) -> int:
    from .sources import icc
    try:
        rows = icc.fetch_all(use_cache=not args.refresh)
    except net.Blocked as exc:
        log.error("blocked by robots.txt: %s", exc)
        return 1
    if not rows:
        log.warning("no rankings parsed - the page layout may have changed")
        return 1
    out = WEB_DATA_DIR / "rankings.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"rankings": [r.to_dict() for r in rows]}, indent=1))
    log.info("wrote %d ranking rows to %s", len(rows), out)
    return 0


def _collect_names(fmt: str, limit: int | None) -> tuple[set[str], dict[str, str]]:
    """First pass: who is in this archive, and what are their Cricsheet ids."""
    names: set[str] = set()
    registry: dict[str, str] = {}
    for match, deliveries in cricsheet.iter_matches(fmt, limit=limit):
        registry.update(match.registry)
        for squad in match.players.values():
            names.update(squad)
        for d in deliveries:
            names.add(d.batter)
            names.add(d.bowler)
    names.discard("")
    return names, registry


def cmd_enrich(args) -> int:
    names: set[str] = set()
    registry: dict[str, str] = {}
    for fmt in args.formats:
        try:
            fmt_names, fmt_registry = _collect_names(fmt, args.limit_matches)
        except FileNotFoundError as exc:
            log.error("%s", exc)
            return 1
        names |= fmt_names
        registry.update(fmt_registry)

    log.info("%d distinct players across %s", len(names), ", ".join(args.formats))
    _records, stats = resolve(
        names, registry,
        extra_file=Path(args.styles_file) if args.styles_file else None,
        use_cricinfo=args.source == "espncricinfo",
        limit=args.limit,
    )
    log.info("enrichment: %s", json.dumps(stats))
    if stats["blocked"]:
        log.error("ESPNcricinfo robots.txt disallowed the profile pages for this "
                  "user-agent. Nothing further was requested. Supply styles with "
                  "--styles-file instead, or add them to data/styles.csv.")
        return 2
    return 0


def cmd_build(args) -> int:
    started = time.time()
    aggregators: dict[str, Aggregator] = {}
    metadata: dict[str, dict] = {}
    provenance: dict = {"sources": [], "enrichment": {}}

    all_names: set[str] = set()
    all_registry: dict[str, str] = {}
    for fmt in args.formats:
        try:
            names, registry = _collect_names(fmt, args.limit_matches)
        except FileNotFoundError as exc:
            log.error("%s", exc)
            return 1
        all_names |= names
        all_registry.update(registry)

    records, stats = resolve(
        all_names, all_registry,
        extra_file=Path(args.styles_file) if args.styles_file else None,
        use_cricinfo=args.enrich == "espncricinfo",
        limit=args.limit,
    )
    styles, hands = split_maps(records)
    provenance["enrichment"] = stats
    log.info("styles resolved for %d/%d players", len(styles), len(all_names))
    if stats["unresolved"]:
        log.warning("%d players have no bowling style; their deliveries will not "
                    "appear in bowling-type splits", stats["unresolved"])

    for fmt in args.formats:
        log.info("building %s", fmt)
        agg = Aggregator(fmt, styles=styles, hands=hands)
        count = 0
        for match, deliveries in cricsheet.iter_matches(
                fmt, limit=args.limit_matches, gender=args.gender):
            agg.registry.update(match.registry)
            agg.add_match(match, deliveries)
            count += 1
            if count % 500 == 0:
                log.info("  %s: %d matches, %d deliveries", fmt, count, agg.deliveries)
        agg.finalise()
        aggregators[fmt] = agg
        log.info("  %s: %s", fmt, json.dumps(agg.summary()))

    for name, record in records.items():
        metadata[name] = {
            "bowlingType": record.get("bowlingType", ""),
            "battingHand": record.get("battingHand", ""),
            "role": record.get("role", ""),
            "country": record.get("country", ""),
            "cricinfoId": record.get("cricinfoId", ""),
            "fullName": record.get("fullName", name),
            "born": record.get("born", ""),
        }

    provenance["sources"] = [
        {"id": "cricsheet", "used": True,
         "note": "Ball-by-ball data for every split on the site (CC BY 4.0)"},
        {"id": "espncricinfo", "used": args.enrich == "espncricinfo",
         "note": "Player styles and roles" if args.enrich == "espncricinfo"
                 else "Not contacted in this build"},
    ]
    provenance["dataset"] = "live"

    rankings = None
    rankings_file = WEB_DATA_DIR / "rankings.json"
    if rankings_file.exists():
        try:
            rankings = json.loads(rankings_file.read_text()).get("rankings")
        except json.JSONDecodeError:
            pass

    summary = export_all(aggregators, metadata, Path(args.out),
                         rankings=rankings, provenance=provenance,
                         pretty=args.pretty)
    log.info("wrote %d players to %s in %.1fs",
             summary["players"], args.out, time.time() - started)
    return 0


def cmd_seed(args) -> int:
    from .seed import build_seed
    return build_seed(Path(args.out), pretty=args.pretty)


def cmd_all(args) -> int:
    for step in (cmd_fetch, cmd_build):
        code = step(args)
        if code:
            return code
    return 0


# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline",
        description="Build the cricket analytics dataset.")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_formats(p, default=tuple(FORMATS)):
        p.add_argument("--formats", nargs="+", default=list(default),
                       choices=list(ALL_FORMATS),
                       help="formats to process (default: the three internationals)")

    p_fetch = sub.add_parser("fetch", help="download Cricsheet archives")
    add_formats(p_fetch)
    p_fetch.add_argument("--refresh", action="store_true",
                         help="ignore the cache and re-download")
    p_fetch.add_argument("--no-mirror", action="store_true", dest="no_mirror",
                         help="only use cricsheet.org; do not fall back to a mirror")
    p_fetch.set_defaults(func=cmd_fetch)

    p_enrich = sub.add_parser("enrich", help="resolve bowling styles")
    add_formats(p_enrich)
    p_enrich.add_argument("--source", choices=["none", "espncricinfo"], default="none",
                          help="opt in to fetching profiles from ESPNcricinfo")
    p_enrich.add_argument("--styles-file", help="extra styles CSV to merge in")
    p_enrich.add_argument("--limit", type=int, help="cap the number of profile requests")
    p_enrich.add_argument("--limit-matches", type=int, dest="limit_matches")
    p_enrich.set_defaults(func=cmd_enrich)

    p_rank = sub.add_parser("rankings", help="fetch ICC rankings")
    p_rank.add_argument("--refresh", action="store_true")
    p_rank.set_defaults(func=cmd_rankings)

    p_build = sub.add_parser("build", help="aggregate, analyse and export")
    add_formats(p_build)
    p_build.add_argument("--out", default=str(WEB_DATA_DIR))
    p_build.add_argument("--enrich", choices=["none", "espncricinfo"], default="none")
    p_build.add_argument("--styles-file")
    p_build.add_argument("--limit", type=int)
    p_build.add_argument("--limit-matches", type=int, dest="limit_matches",
                         help="only process the first N matches (for a quick trial run)")
    p_build.add_argument("--gender", default="male", choices=["male", "female", "any"])
    p_build.add_argument("--pretty", action="store_true",
                         help="indent the JSON (much larger; useful for debugging)")
    p_build.set_defaults(func=cmd_build)

    p_seed = sub.add_parser("seed", help="write the bundled demo dataset")
    p_seed.add_argument("--out", default=str(WEB_DATA_DIR))
    p_seed.add_argument("--pretty", action="store_true")
    p_seed.set_defaults(func=cmd_seed)

    p_all = sub.add_parser("all", help="fetch then build")
    add_formats(p_all)
    p_all.add_argument("--out", default=str(WEB_DATA_DIR))
    p_all.add_argument("--refresh", action="store_true")
    p_all.add_argument("--no-mirror", action="store_true", dest="no_mirror")
    p_all.add_argument("--enrich", choices=["none", "espncricinfo"], default="none")
    p_all.add_argument("--styles-file")
    p_all.add_argument("--limit", type=int)
    p_all.add_argument("--limit-matches", type=int, dest="limit_matches")
    p_all.add_argument("--gender", default="male", choices=["male", "female", "any"])
    p_all.add_argument("--pretty", action="store_true")
    p_all.set_defaults(func=cmd_all)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    setup_logging(args.verbose)
    if getattr(args, "gender", None) == "any":
        args.gender = None
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
