# Hi, I'm Atharva

Here's what I've been building.

## Criclysis: cricket analytics from open ball-by-ball data

**[criclysis.vercel.app](https://criclysis.vercel.app)** · [source code](https://github.com/atharva9806/criclysis)

[![Criclysis home page](https://raw.githubusercontent.com/atharva9806/criclysis/main/docs/screenshots/home.png)](https://criclysis.vercel.app)

Criclysis analyses every men's and women's international match (Tests, ODIs
and T20Is) from [Cricsheet](https://cricsheet.org)'s open ball-by-ball
records. It uses no live-score API and no paid services, and every number on
the site comes from the data.

- **Every international team.** 10,000+ matches, 200+ teams and 380+ venues,
  men's and women's. The site refreshes itself every day.
- **Player analysis.** 5,300+ player profiles show strengths and weaknesses
  measured against comparable players. They also cover matchups by bowling
  type and phase of the innings, and recent form.
- **"Live" without an API.**
  - A daily GitHub Actions pipeline downloads Cricsheet's files, rebuilds the
    dataset and updates the site.
  - A replay engine plays any match ball by ball, with win probability,
    projected and par scores, and matchup cards.
- **Validated models.** Four win-probability models (men's and women's ODI
  and T20I) were tested on matches from 2023 on, which they never saw in
  training. Their chase Brier scores are 0.10–0.14; a coin flip scores 0.25.
- **Checked data.** Before each import, every replay is checked against the
  official scorecard in both Python and TypeScript.
- **Clean UI.** It has dark mode, works on phones from 360 px wide, and passes
  an automated WCAG 2.1 AA accessibility scan.

**Stack:** Python (standard library) · Next.js 16 · React 19 · TypeScript ·
Tailwind CSS 4 · PostgreSQL (Neon) · Drizzle ORM · Recharts · GitHub Actions ·
Vercel

<sub>Cricket data from [Cricsheet](https://cricsheet.org), licensed CC BY 4.0.</sub>
