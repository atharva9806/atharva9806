"""A ball-by-ball match simulator, used to generate the bundled demo dataset.

Why simulate rather than ship a snapshot of real data?

* Cricsheet data is CC BY 4.0 but it is ~200 MB of archives - too much to
  commit, and stale the moment it lands.
* Inventing summary numbers and attributing them to real cricketers would put
  false statistics about identifiable people on a public site.

So the demo dataset is an entirely fictional cricket world: invented players in
invented teams, whose careers are simulated one delivery at a time from latent
skills. The output is Cricsheet-shaped JSON that runs through exactly the same
parser, aggregator, analyser and exporter as real data. That makes the demo a
genuine end-to-end exercise of the pipeline, and it means the strengths and
weaknesses the site surfaces are real discoveries about the simulated players
rather than captions someone typed in - each simulated batter has a planted
weakness against some bowling type, and the analysis engine has to find it.

Everything is seeded, so the dataset is byte-for-byte reproducible.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, field

from .config import PACE_TYPES, PHASES, SPIN_TYPES

# Format anchors, chosen to land near real-world aggregate rates.
FORMAT_MODEL = {
    "test":  {"balls_per_out": 70.0, "run_rate": 3.15, "overs": None, "innings": 4,
              "wickets": 10, "extras_rate": 0.020},
    "odi":   {"balls_per_out": 37.0, "run_rate": 5.7, "overs": 50, "innings": 2,
              "wickets": 10, "extras_rate": 0.030},
    "t20i":  {"balls_per_out": 20.5, "run_rate": 8.5, "overs": 20, "innings": 2,
              "wickets": 10, "extras_rate": 0.035},
}

PHASE_TEMPO = {
    "test": {"new_ball": 0.88, "old_ball": 1.0, "second_new": 1.05},
    "odi": {"powerplay": 0.95, "middle": 0.92, "death": 1.55},
    "t20i": {"powerplay": 1.08, "middle": 0.90, "death": 1.42},
}
PHASE_RISK = {
    "test": {"new_ball": 1.35, "old_ball": 0.88, "second_new": 1.15},
    "odi": {"powerplay": 1.20, "middle": 0.85, "death": 1.70},
    "t20i": {"powerplay": 1.15, "middle": 0.88, "death": 1.65},
}

DISMISSAL_WEIGHTS = {
    "pace": [("caught", 0.56), ("bowled", 0.18), ("lbw", 0.17),
             ("caught and bowled", 0.03), ("stumped", 0.0), ("run out", 0.06)],
    "spin": [("caught", 0.44), ("bowled", 0.16), ("lbw", 0.21),
             ("stumped", 0.11), ("caught and bowled", 0.03), ("run out", 0.05)],
}

def stable_id(name: str) -> str:
    """A deterministic person id for a simulated player.

    Python salts str.__hash__ per process, so using it here made the demo
    dataset differ on every build - and with it every player slug and every
    bookmarked URL. Hashing explicitly keeps the seed reproducible, which is
    the entire claim the demo rests on.
    """
    digest = hashlib.sha1(name.encode()).hexdigest()[:10]
    return f"sim-{digest}"


FIRST_NAMES = [
    "Arun", "Dev", "Ishan", "Kabir", "Nikhil", "Rohan", "Varun", "Yash",
    "Callum", "Daniel", "Elliot", "Fraser", "Harvey", "Jonty", "Miles", "Rory",
    "Ayaan", "Bilal", "Faraz", "Hamza", "Imran", "Junaid", "Naveed", "Zain",
    "Andile", "Bongani", "Cebo", "Dumisa", "Kagiso", "Lwazi", "Sipho", "Thabo",
    "Ashton", "Brody", "Cooper", "Declan", "Jarrah", "Lachlan", "Riley", "Toby",
    "Aravind", "Chamika", "Dilshan", "Kusal", "Nuwan", "Pathum", "Sadeep",
    "Kwame", "Marlon", "Orville", "Ravi", "Shamar", "Tevin", "Wesley",
]
SURNAMES = [
    "Achari", "Bhandari", "Chettiar", "Deshmukh", "Iyengar", "Kulkarni",
    "Marwah", "Nadkarni", "Pillai", "Rautela", "Sethi", "Trivedi", "Vaidya",
    "Ashcroft", "Brindle", "Corcoran", "Danvers", "Eastwood", "Fairweather",
    "Halloran", "Kingsley", "Lockhart", "Mowbray", "Prentice", "Radcliffe",
    "Abbasi", "Chaudhry", "Durrani", "Gilani", "Kasuri", "Lodhi", "Qureshi",
    "Dlamini", "Khumalo", "Mabaso", "Ndlovu", "Sithole", "Tshabalala", "Zulu",
    "Aldridge", "Beckworth", "Cadogan", "Ellery", "Frampton", "Hollis",
    "Amarasena", "Dissanayake", "Gunaratne", "Herath", "Jayakody", "Weerakoon",
    "Alleyne", "Bascombe", "Constantine", "Emtage", "Grimes", "Padmore",
]

TEAMS = [
    {"name": "Northern Republic", "home": "Northern Republic",
     "venues": [("Grand Northern Oval", "Kestrel Bay"), ("Ironbridge Ground", "Aldermoor")]},
    {"name": "Southern Union", "home": "Southern Union",
     "venues": [("Cape Meridian Ground", "Port Meridian"), ("Saltmarsh Oval", "Verity")]},
    {"name": "Eastern Federation", "home": "Eastern Federation",
     "venues": [("Lantern Park", "Hoshin"), ("Old Harbour Stadium", "Kanaya")]},
    {"name": "Western Dominion", "home": "Western Dominion",
     "venues": [("Sunstone Arena", "Coralport"), ("Redgum Field", "Barrowdale")]},
    {"name": "Central Alliance", "home": "Central Alliance",
     "venues": [("The Citadel Ground", "Amberholt"), ("Windmill End", "Draycott")]},
    {"name": "Island Confederacy", "home": "Island Confederacy",
     "venues": [("Palm Reef Stadium", "Tamarind"), ("Blue Lagoon Oval", "Coquina")]},
]

ROLES = ["Top-order batter", "Middle-order batter", "Wicketkeeper batter",
         "Batting all-rounder", "Bowling all-rounder", "Bowler"]


@dataclass
class SimPlayer:
    name: str
    team: str
    role: str
    batting_hand: str
    bowling_type: str
    order: int
    # Latent batting ability, expressed as a z-score. Higher survives longer.
    defence: float = 0.0
    attack: float = 0.0
    # Per bowling-type modifiers: the planted strengths and weaknesses.
    vs_type: dict[str, float] = field(default_factory=dict)
    phase_bias: dict[str, float] = field(default_factory=dict)
    # Latent bowling ability.
    bowl_threat: float = 0.0
    bowl_control: float = 0.0
    vs_hand: dict[str, float] = field(default_factory=dict)
    bowls: bool = False
    peak_year: int = 2018
    longevity: float = 8.0

    def form(self, year: int) -> float:
        """A career arc: players improve, peak, then decline."""
        drift = (year - self.peak_year) / self.longevity
        return math.exp(-1.4 * drift * drift) * 0.35 + 0.82


def make_roster(rng: random.Random, per_team: int = 16) -> list[SimPlayer]:
    players: list[SimPlayer] = []
    used: set[str] = set()
    for team in TEAMS:
        for i in range(per_team):
            while True:
                name = (f"{rng.choice(FIRST_NAMES)[0]} "
                        f"{rng.choice(SURNAMES)}")
                if name not in used:
                    used.add(name)
                    break
            # First 6 are specialist batters, last 5 specialist bowlers.
            if i < 6:
                role = ROLES[0] if i < 3 else ROLES[1]
            elif i == 6:
                role = "Wicketkeeper batter"
            elif i < 9:
                role = rng.choice(["Batting all-rounder", "Bowling all-rounder"])
            else:
                role = "Bowler"

            batting_hand = "left" if rng.random() < 0.28 else "right"
            bowling_type = rng.choice(PACE_TYPES + SPIN_TYPES) if rng.random() < 0.75 \
                else rng.choice(PACE_TYPES)
            bowls = role in ("Bowler", "Bowling all-rounder", "Batting all-rounder") \
                or rng.random() < 0.25

            # Calibrated so that top-order averages, tail-ender averages,
            # bowling averages and economy rates all land near their
            # real-world medians. A properly weak tail matters: without it,
            # bowling averages come out ~6 runs too expensive.
            batting_class = (2.0 - i * 0.26) + rng.gauss(0, 0.28)
            bowling_class = (0.2 + (i - 5) * 0.16 if i >= 6 else -0.5) + rng.gauss(0, 0.3)

            p = SimPlayer(
                name=name, team=team["name"], role=role,
                batting_hand=batting_hand, bowling_type=bowling_type,
                order=i + 1,
                defence=batting_class,
                attack=rng.gauss(0, 0.7) + (0.35 if i >= 5 else 0),
                bowl_threat=bowling_class if bowls else -3.0,
                bowl_control=bowling_class * 0.8 + rng.gauss(0, 0.35),
                bowls=bowls,
                peak_year=rng.randint(2014, 2022),
                longevity=rng.uniform(5.0, 11.0),
            )

            # Plant one clear weakness and one clear strength per batter. The
            # analysis engine has to rediscover these from the ball-by-ball
            # record alone - that is the point of the exercise.
            all_types = PACE_TYPES + SPIN_TYPES
            weak = rng.choice(all_types)
            strong = rng.choice([t for t in all_types if t != weak])
            for t in all_types:
                p.vs_type[t] = rng.gauss(0, 0.18)
            p.vs_type[weak] -= rng.uniform(0.55, 1.05)
            p.vs_type[strong] += rng.uniform(0.45, 0.9)

            for phase, _s, _e, _l in PHASES["t20i"] + PHASES["test"] + PHASES["odi"]:
                p.phase_bias.setdefault(phase, rng.gauss(0, 0.22))

            p.vs_hand = {"right": rng.gauss(0, 0.2), "left": rng.gauss(0, 0.3)}
            players.append(p)
    return players


class MatchSimulator:
    """Simulates one match, delivering Cricsheet-shaped JSON."""

    def __init__(self, fmt: str, rng: random.Random):
        self.fmt = fmt
        self.rng = rng
        self.model = FORMAT_MODEL[fmt]

    # -- outcome model -----------------------------------------------------
    def _ball(self, batter: SimPlayer, bowler: SimPlayer, phase: str,
              year: int, balls_faced: int, chasing: bool, required: float | None):
        model = self.model
        matchup = batter.vs_type.get(bowler.bowling_type, 0.0)
        hand_edge = bowler.vs_hand.get(batter.batting_hand, 0.0)
        form = batter.form(year)

        # Survival: how hard is this batter to dismiss on this ball?
        defence = (batter.defence * form + matchup
                   - bowler.bowl_threat * 0.55 - hand_edge * 0.4
                   + batter.phase_bias.get(phase, 0.0) * 0.5)
        # Batters are markedly more vulnerable before they are set.
        settling = 0.70 if balls_faced < 12 else (0.90 if balls_faced < 30 else 1.0)

        risk = PHASE_RISK[self.fmt].get(phase, 1.0)
        p_out = (1.0 / model["balls_per_out"]) * math.exp(-0.62 * defence) \
            / settling * risk
        p_out = min(0.22, max(0.0015, p_out))

        if self.rng.random() < p_out:
            family = "spin" if bowler.bowling_type in SPIN_TYPES else "pace"
            kinds, weights = zip(*DISMISSAL_WEIGHTS[family])
            kind = self.rng.choices(kinds, weights=weights)[0]
            return {"runs": 0, "wicket": kind}

        # Scoring: tempo scales with the batter's intent and the situation.
        tempo = PHASE_TEMPO[self.fmt].get(phase, 1.0)
        if chasing and required is not None:
            tempo *= min(1.9, max(0.8, required / max(1.0, model["run_rate"])))
        aggression = (batter.attack * form + matchup * 0.5
                      - bowler.bowl_control * 0.4
                      + batter.phase_bias.get(phase, 0.0))
        scale = tempo * math.exp(0.30 * aggression)

        base = self._run_weights(scale)
        runs = self.rng.choices([0, 1, 2, 3, 4, 6], weights=base)[0]
        return {"runs": runs, "wicket": None}

    # Realistic ceilings: even a full-tilt slog does not put a boundary on
    # more than about a third of balls.
    MAX_FOUR = 0.34
    MAX_SIX = 0.22
    MIN_DOT = 0.015

    def _run_weights(self, scale: float) -> list[float]:
        """Outcome weights for [0,1,2,3,4,6] that realise the target run rate.

        Boundary frequency rises faster than linearly with intent, so the naive
        shape overshoots wildly once tempo climbs - at death-overs settings it
        was producing 26 runs an over. So the shape is built, then corrected:
        boundaries are scaled back until the runs they alone contribute leave
        room for the singles, and the dot/single split is solved exactly for
        whatever target remains.
        """
        scale = min(2.4, max(0.4, scale))
        rpb = self.model["run_rate"] * scale / 6.0

        six = min(self.MAX_SIX, 0.055 * (rpb ** 2.1))
        four = min(self.MAX_FOUR, 0.115 * (rpb ** 1.45))
        two = 0.050 + 0.018 * rpb
        three = 0.006

        # Leave at least this share of the target to be made in ones and twos,
        # otherwise the innings becomes all boundaries and no strike rotation.
        for _ in range(6):
            scored = 4 * four + 6 * six + 2 * two + 3 * three
            budget = 0.86 * rpb
            if scored <= budget:
                break
            shrink_by = budget / scored
            four *= shrink_by
            six *= shrink_by
            two *= shrink_by

        scored = 4 * four + 6 * six + 2 * two + 3 * three
        used = four + six + two + three
        one = max(0.0, rpb - scored)
        # Singles cannot exceed the probability left over after everything else.
        one = min(one, max(0.0, 1.0 - used - self.MIN_DOT))
        dot = max(self.MIN_DOT, 1.0 - used - one)

        weights = [dot, one, two, three, four, six]
        total = sum(weights)
        return [w / total for w in weights]

    # -- innings -----------------------------------------------------------
    def _phase_for(self, over: int) -> str:
        for key, start, end, _label in PHASES[self.fmt]:
            if start <= over < end:
                return key
        return PHASES[self.fmt][-1][0]

    def innings(self, batting: list[SimPlayer], bowling: list[SimPlayer],
                year: int, target: int | None, innings_no: int) -> tuple[dict, int]:
        model = self.model
        max_overs = model["overs"]
        if max_overs is None:                      # Test innings
            max_overs = self.rng.randint(60, 145)

        bowlers = [p for p in bowling if p.bowls] or bowling[-5:]
        # A rough bowling allocation: front-line bowlers bowl the most.
        bowlers = sorted(bowlers, key=lambda p: -p.bowl_threat)[:6]
        max_per_bowler = math.ceil(max_overs / 5) if self.fmt != "test" else max_overs

        striker_idx, non_striker_idx = 0, 1
        next_batter = 2
        balls_faced = {p.name: 0 for p in batting}
        overs_bowled = {p.name: 0 for p in bowlers}
        wickets = 0
        score = 0
        overs_data = []
        last_bowler = None

        for over in range(max_overs):
            if wickets >= model["wickets"] or next_batter > len(batting) + 1:
                break
            if target is not None and score > target:
                break
            choices = [b for b in bowlers
                       if overs_bowled[b.name] < max_per_bowler and b is not last_bowler]
            if not choices:
                choices = [b for b in bowlers if b is not last_bowler] or bowlers
            weights = [math.exp(0.9 * b.bowl_threat) for b in choices]
            bowler = self.rng.choices(choices, weights=weights)[0]
            overs_bowled[bowler.name] += 1
            last_bowler = bowler
            phase = self._phase_for(over)

            deliveries = []
            legal = 0
            while legal < 6:
                if wickets >= model["wickets"]:
                    break
                if target is not None and score > target:
                    break
                striker = batting[striker_idx]
                non_striker = batting[non_striker_idx]

                # Extras
                if self.rng.random() < model["extras_rate"]:
                    kind = self.rng.choices(["wides", "noballs", "byes", "legbyes"],
                                            weights=[0.55, 0.12, 0.10, 0.23])[0]
                    extra_runs = 1 if kind in ("wides", "noballs") else \
                        self.rng.choices([1, 2, 4], weights=[0.75, 0.18, 0.07])[0]
                    deliveries.append({
                        "batter": striker.name, "bowler": bowler.name,
                        "non_striker": non_striker.name,
                        "extras": {kind: extra_runs},
                        "runs": {"batter": 0, "extras": extra_runs, "total": extra_runs},
                    })
                    score += extra_runs
                    if kind in ("byes", "legbyes"):
                        legal += 1
                    continue

                required = None
                if target is not None:
                    balls_left = max(1, (max_overs - over) * 6 - legal)
                    required = 6.0 * (target + 1 - score) / balls_left

                outcome = self._ball(striker, bowler, phase, year,
                                     balls_faced[striker.name],
                                     target is not None, required)
                balls_faced[striker.name] += 1
                legal += 1

                delivery = {
                    "batter": striker.name, "bowler": bowler.name,
                    "non_striker": non_striker.name,
                    "runs": {"batter": outcome["runs"], "extras": 0,
                             "total": outcome["runs"]},
                }
                if outcome["wicket"]:
                    kind = outcome["wicket"]
                    out_player = non_striker.name if kind == "run out" and \
                        self.rng.random() < 0.4 else striker.name
                    fielders = []
                    if kind in ("caught", "run out", "stumped"):
                        fielder = self.rng.choice([p for p in bowling if p is not bowler])
                        fielders = [{"name": fielder.name}]
                    delivery["wickets"] = [{"player_out": out_player, "kind": kind,
                                            **({"fielders": fielders} if fielders else {})}]
                    wickets += 1
                    if next_batter < len(batting):
                        if out_player == striker.name:
                            striker_idx = next_batter
                        else:
                            non_striker_idx = next_batter
                        next_batter += 1
                else:
                    score += outcome["runs"]
                    if outcome["runs"] % 2 == 1:
                        striker_idx, non_striker_idx = non_striker_idx, striker_idx
                deliveries.append(delivery)

            if deliveries:
                overs_data.append({"over": over, "deliveries": deliveries})
            striker_idx, non_striker_idx = non_striker_idx, striker_idx

        innings_payload = {
            "team": batting[0].team,
            "overs": overs_data,
        }
        if target is not None:
            innings_payload["target"] = {"overs": max_overs, "runs": target + 1}
        return innings_payload, score

    def match(self, team_a: list[SimPlayer], team_b: list[SimPlayer],
              date: str, venue: str, city: str, match_id: str) -> dict:
        year = int(date[:4])
        bat_first, bowl_first = (team_a, team_b) if self.rng.random() < 0.5 \
            else (team_b, team_a)

        innings = []
        if self.fmt == "test":
            totals = []
            for i in range(4):
                batting = bat_first if i % 2 == 0 else bowl_first
                bowling = bowl_first if i % 2 == 0 else bat_first
                payload, score = self.innings(batting, bowling, year, None, i + 1)
                if not payload["overs"]:
                    break
                innings.append(payload)
                totals.append(score)
                # A team well ahead after three innings may not need a fourth.
                if i == 2 and len(totals) == 3 and totals[0] + totals[2] < totals[1]:
                    break
        else:
            first, score = self.innings(bat_first, bowl_first, year, None, 1)
            innings.append(first)
            second, _ = self.innings(bowl_first, bat_first, year, score, 2)
            innings.append(second)

        return {
            "meta": {"data_version": "1.1.0", "created": date, "revision": 1},
            "info": {
                "balls_per_over": 6,
                "city": city,
                "dates": [date],
                "gender": "male",
                "match_type": {"test": "Test", "odi": "ODI", "t20i": "T20"}[self.fmt],
                "overs": self.model["overs"],
                "season": date[:4],
                "team_type": "international",
                "teams": [bat_first[0].team, bowl_first[0].team],
                "venue": venue,
                "toss": {"winner": bat_first[0].team, "decision": "bat"},
                "outcome": {"winner": self.rng.choice(
                    [bat_first[0].team, bowl_first[0].team])},
                "players": {
                    bat_first[0].team: [p.name for p in bat_first],
                    bowl_first[0].team: [p.name for p in bowl_first],
                },
                "registry": {"people": {p.name: stable_id(p.name)
                                        for p in bat_first + bowl_first}},
            },
            "innings": innings,
        }
