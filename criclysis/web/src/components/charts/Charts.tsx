"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#0071e3", "#7d3cff", "#ff375f", "#ff9500", "#34c759", "#5ac8fa", "#af52de"];
const axis = { fontSize: 11, fill: "#6e6e73" };
const grid = { stroke: "rgba(0,0,0,0.06)", vertical: false };
const tip = { contentStyle: { borderRadius: 14, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.12)", fontSize: 12 } };

export function AttributeRadar({
  data,
  keys = [{ key: "value", name: "Rating", color: "#0071e3" }],
  height = 300,
}: {
  data: Record<string, string | number>[];
  keys?: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(0,0,0,0.08)" />
        <PolarAngleAxis dataKey="attribute" tick={{ fontSize: 11, fill: "#6e6e73" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        {keys.map((k) => (
          <Radar key={k.key} name={k.name} dataKey={k.key} stroke={k.color} fill={k.color} fillOpacity={0.18} strokeWidth={2} />
        ))}
        {keys.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        <Tooltip {...tip} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function CareerArea({ data, metric, color = "#0071e3", height = 260 }: { data: { year: number; [k: string]: number | null }[]; metric: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 10 }}>
        <defs>
          <linearGradient id={`g-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="year" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <Tooltip {...tip} />
        <Area type="monotone" dataKey={metric} stroke={color} strokeWidth={2.5} fill={`url(#g-${metric})`} dot={false} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RecentBars({ data, metric, height = 220 }: { data: { label: string; value: number; sub?: string; notOut?: boolean }[]; metric: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -18, right: 4, top: 10 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={50} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <Tooltip
          {...tip}
          formatter={(v) => [`${v}${metric === "runs" ? "" : ""}`, metric]}
          labelFormatter={(l, payload) => {
            const p = payload?.[0]?.payload as { sub?: string } | undefined;
            return `${l}${p?.sub ? ` · ${p.sub}` : ""}`;
          }}
        />
        <Bar dataKey="value" radius={[8, 8, 2, 2]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= (metric === "runs" ? 50 : 3) ? "#34c759" : d.value >= (metric === "runs" ? 25 : 1) ? "#0071e3" : "#c7c7cc"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FormatBars({ data, keys, height = 240 }: { data: Record<string, string | number | null>[]; keys: { key: string; name: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -18, right: 4, top: 10 }} barGap={4}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="format" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.name} fill={PALETTE[i % PALETTE.length]} radius={[8, 8, 2, 2]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DismissalDonut({ data, height = 240 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={3} cornerRadius={6} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function WormChart({ data, teamA, teamB, height = 220 }: { data: { over: number; a?: number; b?: number }[]; teamA: string; teamB: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -18, right: 8, top: 10 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="over" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} />
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="a" name={teamA} stroke="#0071e3" strokeWidth={2.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="b" name={teamB} stroke="#ff375f" strokeWidth={2.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LeaderBars({ data, color = "#0071e3", height = 300, unit = "" }: { data: { name: string; value: number }[]; color?: string; height?: number; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 30, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1d1d1f" }} axisLine={false} tickLine={false} width={110} />
        <Tooltip {...tip} formatter={(v) => [`${Number(v).toLocaleString()}${unit}`, ""]} />
        <Bar dataKey="value" fill={color} radius={[0, 10, 10, 0]} barSize={18} label={{ position: "right", fontSize: 11, fill: "#6e6e73", formatter: (v: unknown) => Number(v).toLocaleString() }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
