"""Normalising free-text bowling and batting styles onto a fixed taxonomy.

Profile sources describe styles in prose that varies by site and by era:
"Right arm Fast medium", "RFM", "Slow Left arm Orthodox", "Legbreak googly".
The matchup engine needs one of the ten keys in :data:`config.BOWLING_TYPES`,
so everything funnels through here.
"""
from __future__ import annotations

import re

from .config import BOWLING_TYPES

_WS = re.compile(r"[^a-z]+")


def _key(text: str) -> str:
    return _WS.sub(" ", (text or "").lower()).strip()


# Exact abbreviations used by several feeds.
ABBREV = {
    "rf": "rf", "rfm": "rfm", "rmf": "rfm", "rm": "rm", "rs": "rm", "rsm": "rm",
    "lf": "lf", "lfm": "lfm", "lmf": "lfm", "lm": "lm", "ls": "lm", "lsm": "lm",
    "ob": "ob", "obg": "ob", "sr": "ob",
    "lb": "lb", "lbg": "lb", "lg": "lb",
    "sla": "sla", "slo": "sla", "sl": "sla", "slow left arm orthodox": "sla",
    "slc": "slc", "slw": "slc", "lws": "slc",
}


def normalise_bowling_style(text: str) -> str:
    """Map a free-text bowling style onto a BOWLING_TYPES key ('' if unknown)."""
    key = _key(text)
    if not key:
        return ""

    compact = key.replace(" ", "")
    if compact in ABBREV:
        return ABBREV[compact]
    if key in ABBREV:
        return ABBREV[key]

    left = bool(re.search(r"\bleft\b", key))
    right = bool(re.search(r"\bright\b", key))

    # --- Spin first: its vocabulary is unambiguous ---------------------------
    if re.search(r"leg ?break|legspin|leg spin|googly|wrist spin", key):
        # Left-arm wrist spin is variously "left arm wrist spin", "chinaman",
        # "slow left arm chinaman", "left arm legbreak".
        return "slc" if left else "lb"
    if re.search(r"chinaman|unorthodox", key):
        return "slc"
    if re.search(r"off ?break|offspin|off spin|offbreak|doosra", key):
        return "ob"
    if re.search(r"orthodox", key):
        return "sla"
    if re.search(r"\bslow\b", key) and left:
        return "sla"
    if re.search(r"\bslow\b", key) and right:
        return "ob"

    # --- Pace ---------------------------------------------------------------
    fast = bool(re.search(r"\bfast\b|\bpace\b|\bquick\b", key))
    medium = bool(re.search(r"medium|\bmed\b", key))
    if fast and medium:
        return "lfm" if left else "rfm"
    if fast:
        return "lf" if left else "rf"
    if medium:
        return "lm" if left else "rm"

    # Nothing recognisable but an arm: assume seam, which is much the commoner
    # default among players whose style is recorded only as "left arm".
    if left:
        return "lm"
    if right:
        return "rm"
    return ""


def normalise_batting_style(text: str) -> str:
    """Return 'left' or 'right' ('' if unknown)."""
    key = _key(text)
    if not key:
        return ""
    if "left" in key or key in {"lhb", "lh"}:
        return "left"
    if "right" in key or key in {"rhb", "rh"}:
        return "right"
    return ""


def family(bowling_type: str) -> str:
    """'pace', 'spin' or '' for a BOWLING_TYPES key."""
    return BOWLING_TYPES.get(bowling_type, {}).get("family", "")


def label(bowling_type: str) -> str:
    return BOWLING_TYPES.get(bowling_type, {}).get("label", "Unknown")


def matchup_note(bowling_type: str, batting_hand: str) -> str:
    """Describe the ball's default movement relative to the batter.

    This is the piece of cricket domain knowledge the strategy engine leans on:
    whether the stock ball is angling in or leaving, which decides both the plan
    and the field. Right-arm over to a right-hander shapes away; the same bowler
    to a left-hander shapes in. Off spin turns into a right-hander and away from
    a left-hander, and so on.
    """
    spec = BOWLING_TYPES.get(bowling_type)
    if not spec or batting_hand not in ("left", "right"):
        return ""
    fam = spec["family"]
    default = spec.get("swing") or spec.get("turn") or ""
    into_rhb = default == "into_rhb"
    # Flip the frame of reference for a left-handed batter.
    into_batter = into_rhb if batting_hand == "right" else not into_rhb
    if fam == "pace":
        return "angles into the batter" if into_batter else "shapes away from the batter"
    return "turns into the batter" if into_batter else "turns away from the batter"
