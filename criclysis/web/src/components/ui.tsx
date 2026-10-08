import Link from "next/link";
import type { PlayerSummary } from "@/lib/analytics";

export function flagEmoji(cc: string) {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function formTone(f: number) {
  if (f >= 30) return "bg-[#ff3b30]/10 text-[#ff3b30]";
  if (f >= 10) return "bg-[#34c759]/10 text-[#248a3d]";
  if (f > -10) return "bg-[#0071e3]/10 text-[#0071e3]";
  if (f > -30) return "bg-[#ff9500]/10 text-[#c93400]";
  return "bg-black/5 text-[#6e6e73]";
}

export function FormBadge({ form, label }: { form: number; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${formTone(form)}`}>
      {label}
      <span className="opacity-70">
        {form > 0 ? "+" : ""}
        {form}
      </span>
    </span>
  );
}

export function RatingRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.08)" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#0071e3" />
            <stop offset="100%" stopColor="#7d3cff" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-[13px] font-semibold">{Math.round(value)}</span>
    </div>
  );
}

export function Sparkline({ values, color = "#0071e3" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const w = 90;
  const h = 26;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 3) - 1}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PlayerCard({ p, delay = 0 }: { p: PlayerSummary; delay?: number }) {
  const isBowler = p.role === "Bowler";
  const spark = [...p.recent].reverse().slice(-10).map((i) => (isBowler ? (i.wickets ?? 0) * 20 : i.runs ?? 0));
  const best = p.stats.reduce((a, b) => (b.runs > a.runs ? b : a), p.stats[0]);
  return (
    <Link href={`/players/${p.slug}`} className={`card card-hover fade-up delay-${delay} block p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl">{flagEmoji(p.countryCode)}</div>
          <h3 className="mt-2 text-[17px] font-semibold tracking-tight">{p.name}</h3>
          <p className="text-xs text-[#6e6e73]">
            {p.role} · {p.country}
          </p>
        </div>
        <RatingRing value={p.overallRating} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#6e6e73]">{isBowler ? "Wickets" : "Runs"}</p>
          <p className="text-xl font-semibold tabular-nums">{(isBowler ? p.totalWickets : p.totalRuns).toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-[#6e6e73]">{isBowler ? "Best avg" : "Best avg"}</p>
          <p className="text-xl font-semibold tabular-nums">
            {isBowler
              ? Math.min(...p.stats.map((s) => s.bowlingAvg ?? 99)).toFixed(1)
              : best?.battingAvg.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Sparkline values={spark} color={p.form >= 10 ? "#34c759" : p.form <= -10 ? "#ff9500" : "#0071e3"} />
        <FormBadge form={p.form} label={p.formLabel} />
      </div>
    </Link>
  );
}

export function SectionTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">{eyebrow}</p>}
      <h2 className="headline text-3xl md:text-4xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-[17px] text-[#6e6e73]">{sub}</p>}
    </div>
  );
}
