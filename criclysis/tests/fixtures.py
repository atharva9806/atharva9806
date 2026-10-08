"""Hand-built Cricsheet-shaped fixtures with known, checkable answers."""
from __future__ import annotations


def simple_t20() -> dict:
    """A two-over innings whose totals can be worked out on paper.

    Over 1 (Starc, left-arm fast) to Rohit:
        4, 0, 1(to Kohli), then Kohli: 6, wide+0, 0, out caught
    Over 2 (Zampa, leg break) to Kohli/Rohit:
        Rohit: 2, 1 ; Kohli: 0, 4, 0, 1
    """
    return {
        "meta": {"data_version": "1.1.0"},
        "info": {
            "balls_per_over": 6,
            "city": "Mumbai",
            "dates": ["2023-11-19"],
            "gender": "male",
            "match_type": "T20",
            "overs": 20,
            "teams": ["India", "Australia"],
            "venue": "Wankhede Stadium",
            "season": "2023/24",
            "toss": {"winner": "Australia", "decision": "field"},
            "outcome": {"winner": "Australia"},
            "players": {
                "India": ["RG Sharma", "V Kohli"],
                "Australia": ["MA Starc", "A Zampa"],
            },
            "registry": {"people": {
                "RG Sharma": "p-rohit", "V Kohli": "p-kohli",
                "MA Starc": "p-starc", "A Zampa": "p-zampa",
            }},
        },
        "innings": [{
            "team": "India",
            "overs": [
                {"over": 0, "deliveries": [
                    {"batter": "RG Sharma", "bowler": "MA Starc",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 4, "extras": 0, "total": 4}},
                    {"batter": "RG Sharma", "bowler": "MA Starc",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "RG Sharma", "bowler": "MA Starc",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 1, "extras": 0, "total": 1}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 6, "extras": 0, "total": 6}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "extras": {"wides": 1},
                     "runs": {"batter": 0, "extras": 1, "total": 1}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "V Kohli", "bowler": "MA Starc",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0},
                     "wickets": [{"player_out": "V Kohli", "kind": "caught",
                                  "fielders": [{"name": "A Zampa"}]}]},
                ]},
                {"over": 1, "deliveries": [
                    {"batter": "RG Sharma", "bowler": "A Zampa",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 2, "extras": 0, "total": 2}},
                    {"batter": "RG Sharma", "bowler": "A Zampa",
                     "non_striker": "V Kohli",
                     "runs": {"batter": 1, "extras": 0, "total": 1}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 4, "extras": 0, "total": 4}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 0, "extras": 0, "total": 0}},
                    {"batter": "V Kohli", "bowler": "A Zampa",
                     "non_striker": "RG Sharma",
                     "runs": {"batter": 1, "extras": 0, "total": 1}},
                ]},
            ],
        }],
    }


def maiden_over_match() -> dict:
    """One wicket-maiden plus a run-out, to check maiden and credit logic."""
    base = simple_t20()
    base["innings"] = [{
        "team": "India",
        "overs": [
            {"over": 0, "deliveries": [
                {"batter": "RG Sharma", "bowler": "MA Starc",
                 "non_striker": "V Kohli",
                 "runs": {"batter": 0, "extras": 0, "total": 0}}
                for _ in range(5)
            ] + [
                {"batter": "RG Sharma", "bowler": "MA Starc",
                 "non_striker": "V Kohli",
                 "runs": {"batter": 0, "extras": 0, "total": 0},
                 "wickets": [{"player_out": "V Kohli", "kind": "run out",
                              "fielders": [{"name": "A Zampa"}]}]},
            ]},
        ],
    }]
    return base


STYLES = {"MA Starc": "lf", "A Zampa": "lb"}
HANDS = {"RG Sharma": "right", "V Kohli": "right"}
