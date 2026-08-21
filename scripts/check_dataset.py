#!/usr/bin/env python3
"""Report what the site will load, and fail loudly if there is nothing to load."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "data"

REQUIRED = ["manifest.json", "players.json", "teams.json", "venues.json", "cohorts.json"]


def main() -> int:
    missing = [name for name in REQUIRED if not (DATA / name).exists()]
    if missing:
        print(f"missing from {DATA}: {', '.join(missing)}", file=sys.stderr)
        print("build the demo dataset with:  python -m pipeline seed", file=sys.stderr)
        print("or the real one with:         python -m pipeline all", file=sys.stderr)
        return 1

    manifest = json.loads((DATA / "manifest.json").read_text())
    index = json.loads((DATA / "players.json").read_text())["players"]
    details = list((DATA / "players").glob("*.json"))

    print(f"dataset  : {manifest.get('provenance', {}).get('dataset', 'live')}")
    print(f"built    : {manifest.get('generated', 'unknown')}")
    print(f"players  : {manifest.get('playerCount')} indexed, {len(details)} detail files")
    for key, spec in manifest.get("formats", {}).items():
        print(f"  {spec.get('label', key):5} {spec.get('matches', 0):>6} matches"
              f"  {spec.get('deliveries', 0):>9} deliveries"
              f"  {spec.get('bowlersMissingStyle', 0):>4} bowlers without a style")

    problems = []
    if len(index) != len(details):
        problems.append(f"index lists {len(index)} players but {len(details)} detail files exist")
    for row in index[:50]:
        if not (DATA / "players" / f"{row['slug']}.json").exists():
            problems.append(f"no detail file for {row['name']} ({row['slug']})")

    size = sum(p.stat().st_size for p in DATA.rglob("*.json")) / 1e6
    print(f"size     : {size:.1f} MB")

    if problems:
        print("\nproblems:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("dataset looks consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
