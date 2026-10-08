# Win probability, projected score and par score

These numbers power the live page. They are learned from Cricsheet ball-by-ball
history (CC BY 4.0). Nothing is hand-tuned, and the same code runs on live
matches and on replays.

```
python -m pipeline fetch --formats odi t20i
python -m pipeline winprob      # writes web/data/winprob.json
python -m pipeline replays      # writes web/data/replays/*.json
```

## Data

The model uses men's ODIs and T20Is with a full allocation of overs and a
decided result: 2,157 ODIs and 3,145 T20Is through June 2026. Matches settled
by a rain rule (DLS), shortened before the start, or abandoned are left out,
because their targets do not mean what the model assumes they mean.

## 1. Resources: how many more runs?

For a side with `u` legal balls left and `w` wickets down, the expected
further runs follow the curve used by Duckworth-Lewis:

    R(u, w) = Z_w · (1 − e^(−b_w · u))

`Z_w` and `b_w` are fitted separately for each wicket count, by weighted least
squares over every state of every completed first innings. One rule is then
enforced: losing a wicket can never add resources. The spread of real outcomes
around `R` gives a variance-to-mean ratio for each wicket count, and that
ratio sets the confidence band on the projected score.

**Projected score** = runs so far + `R(u, w)`, with an 80% band.

## 2. Chase model

What decides a chase is how much of the remaining resources the target still
demands:

    x = log(runs needed / R(u, w))

A logistic regression on `x`, its interactions with the fraction of the
innings left and with wickets lost, gives P(chasing side wins). The fit
aggregates about a million ball states into bins first, then uses Newton's
method, with no third-party libraries.

## 3. First innings

There is no target yet, so the model integrates over the possible final
totals. The distribution of the final total comes from the resources model.
The chance of defending each total comes from the chase model, run from
ball 1.

**Par score** is the first-innings total that gives the side batting first an
even chance: **260 in ODIs and 150 in T20Is**. Each ground's par is shifted by
how much more or less teams score there than average. That shift is shrunk
toward zero for grounds with few matches, so one freak game can't set a
ground's par. Two examples: Wankhede's ODI par is 293, and the MCG's is 266.

## Validation

The model was trained on matches before 2023 and scored on every ball state
of the 2023–2026 matches, which it never saw. The Brier score is the mean
squared error of the probability, so lower is better; a coin flip scores 0.25.
Skill is the improvement over a coin flip.

| | Holdout matches | Ball states | Brier | Skill | Log loss |
|---|---|---|---|---|---|
| T20I chase | 1,676 | 167,898 | **0.109** | 56% | 0.336 |
| ODI chase | 367 | 87,609 | **0.129** | 49% | 0.395 |
| T20I first innings | 1,676 | 32,624 | 0.203 | 19% | 0.588 |
| ODI first innings | 367 | 17,171 | 0.216 | 14% | 0.618 |

First-innings skill is lower for a real reason, not a modelling failure: at
the halfway point nobody knows how well the chase will go.

Recent matches can be weighted more heavily. The half-life is chosen on
2020–2022 using a model trained on earlier matches, so the 2023+ test set is
never consulted. The search picked 12 years, but every candidate scored within
0.001 Brier of the others, so recency barely matters.

### Known limitation

On the ODI holdout, chases sitting at 30–50% won more often than predicted. In
the 196 matches that passed through that band, the model predicted 40% and
the observed rate was 49%, with a 95% cluster-bootstrap interval of 41–58%.
Modern ODI sides recover from those positions more often than the 2004–2022
history suggests. The model is not re-tuned against the test set to hide
this. The exported model is refitted on all matches, including 2023–2026,
which partly absorbs the shift.

Also out of scope: team strength, pitch conditions and the individual players
at the crease. The model only knows the match state. The matchup cards on the
live page fill in the player side from each player's ball-by-ball record.

## Worked example: the 2023 World Cup final

| Moment | Score | P(India win) |
|---|---|---|
| India after 40 overs | 197/5 | 54% |
| India all out | 240 (par 260) | 39% |
| Australia after 10 overs | 60/3, need 181 | 59% |
| Australia after 20 overs | 104/3, need 137 | 34% |
| Australia after 30 overs | 167/3, need 74 | 3% |

Head and Labuschagne's partnership is visible as the collapse from 59% to 3%.
