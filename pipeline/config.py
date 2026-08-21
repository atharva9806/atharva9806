"""Central configuration for the cricket analytics data pipeline."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(os.environ.get("CRICKET_CACHE", ROOT / ".cache"))
RAW_DIR = CACHE_DIR / "raw"
WEB_DATA_DIR = ROOT / "web" / "data"

# ---------------------------------------------------------------------------
# Formats
# ---------------------------------------------------------------------------
# Cricsheet publishes one archive per competition group. The three international
# formats are the backbone of the site; the franchise leagues are optional extras
# because they add a lot of volume for a narrower audience.
FORMATS = {
    "test": {
        "label": "Test",
        "archive": "tests_json.zip",
        "innings_limit": 4,
        "balls_per_innings": None,   # unlimited
        "white_ball": False,
    },
    "odi": {
        "label": "ODI",
        "archive": "odis_json.zip",
        "innings_limit": 2,
        "balls_per_innings": 300,
        "white_ball": True,
    },
    "t20i": {
        "label": "T20I",
        "archive": "t20s_json.zip",
        "innings_limit": 2,
        "balls_per_innings": 120,
        "white_ball": True,
    },
}

OPTIONAL_FORMATS = {
    "ipl": {"label": "IPL", "archive": "ipl_json.zip", "innings_limit": 2,
            "balls_per_innings": 120, "white_ball": True},
    "bbl": {"label": "BBL", "archive": "bbl_json.zip", "innings_limit": 2,
            "balls_per_innings": 120, "white_ball": True},
    "psl": {"label": "PSL", "archive": "psl_json.zip", "innings_limit": 2,
            "balls_per_innings": 120, "white_ball": True},
}

ALL_FORMATS = {**FORMATS, **OPTIONAL_FORMATS}

# ---------------------------------------------------------------------------
# Phase definitions (over index is 0-based)
# ---------------------------------------------------------------------------
PHASES = {
    "t20i": [
        ("powerplay", 0, 6, "Powerplay (1-6)"),
        ("middle", 6, 15, "Middle (7-15)"),
        ("death", 15, 20, "Death (16-20)"),
    ],
    "odi": [
        ("powerplay", 0, 10, "Powerplay (1-10)"),
        ("middle", 10, 40, "Middle (11-40)"),
        ("death", 40, 50, "Death (41-50)"),
    ],
    "test": [
        ("new_ball", 0, 20, "New ball (1-20)"),
        ("old_ball", 20, 60, "Old ball (21-60)"),
        ("second_new", 60, 1000, "Second new ball (80+)"),
    ],
}
PHASES["ipl"] = PHASES["bbl"] = PHASES["psl"] = PHASES["t20i"]

# ---------------------------------------------------------------------------
# Bowling-style taxonomy
# ---------------------------------------------------------------------------
# Free-text styles from profile sources are normalised onto these buckets, which
# are the units the matchup engine reasons about.
BOWLING_TYPES = {
    "rf": {"label": "Right-arm fast", "family": "pace", "arm": "right", "swing": "away_to_rhb"},
    "rfm": {"label": "Right-arm fast-medium", "family": "pace", "arm": "right", "swing": "away_to_rhb"},
    "rm": {"label": "Right-arm medium", "family": "pace", "arm": "right", "swing": "away_to_rhb"},
    "lf": {"label": "Left-arm fast", "family": "pace", "arm": "left", "swing": "into_rhb"},
    "lfm": {"label": "Left-arm fast-medium", "family": "pace", "arm": "left", "swing": "into_rhb"},
    "lm": {"label": "Left-arm medium", "family": "pace", "arm": "left", "swing": "into_rhb"},
    "ob": {"label": "Off break", "family": "spin", "arm": "right", "turn": "into_rhb"},
    "lb": {"label": "Leg break", "family": "spin", "arm": "right", "turn": "away_from_rhb"},
    "sla": {"label": "Slow left-arm orthodox", "family": "spin", "arm": "left", "turn": "away_from_rhb"},
    "slc": {"label": "Left-arm wrist spin", "family": "spin", "arm": "left", "turn": "into_rhb"},
}

PACE_TYPES = [k for k, v in BOWLING_TYPES.items() if v["family"] == "pace"]
SPIN_TYPES = [k for k, v in BOWLING_TYPES.items() if v["family"] == "spin"]

# ---------------------------------------------------------------------------
# Sample-size gates
# ---------------------------------------------------------------------------
# A split is only shown, and only feeds the strengths/weaknesses engine, once it
# clears these ball counts. Cricket splits are extremely noisy below them.
@dataclass(frozen=True)
class Thresholds:
    # minimum balls for a batting split to be reported at all
    min_balls_split: int = 60
    # minimum balls for a split to be eligible as a strength/weakness claim
    min_balls_claim: int = 150
    # minimum balls faced overall to be included in a peer cohort
    min_balls_cohort: int = 600
    # minimum balls bowled for bowling splits
    min_balls_bowled_split: int = 90
    min_balls_bowled_claim: int = 240
    min_balls_bowled_cohort: int = 900
    # percentile cut-offs for labelling
    strength_pct: float = 70.0
    weakness_pct: float = 30.0
    # a claim needs to clear the cohort median by this margin to avoid noise
    min_effect: float = 0.04

THRESHOLDS = Thresholds()

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------
@dataclass
class NetConfig:
    user_agent: str = os.environ.get(
        "CRICKET_UA",
        "cricket-analytics/1.0 (open-source analytics project; contact via repository issues)",
    )
    # Seconds between requests to the same host. Deliberately conservative.
    delay_seconds: float = float(os.environ.get("CRICKET_DELAY", "2.0"))
    timeout: int = 45
    max_retries: int = 4
    backoff_base: float = 2.0
    respect_robots: bool = os.environ.get("CRICKET_IGNORE_ROBOTS", "") != "1"

NET = NetConfig()

SOURCES = {
    "cricsheet": {
        "name": "Cricsheet",
        "base": "https://cricsheet.org",
        "licence": "CC BY 4.0",
        "role": "Ball-by-ball match data (primary source for every split on this site)",
        "bulk": True,
    },
    "espncricinfo": {
        "name": "ESPNcricinfo",
        "base": "https://www.espncricinfo.com",
        "licence": "Proprietary - see site terms",
        "role": "Player profile metadata (bowling style, batting hand, role) and career aggregates",
        "bulk": False,
    },
    "icc": {
        "name": "ICC",
        "base": "https://www.icc-cricket.com",
        "licence": "Proprietary - see site terms",
        "role": "Official team and player rankings",
        "bulk": False,
    },
}
