"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/strategy", label: "Strategy" },
  { href: "/live", label: "Live" },
];

export default function Nav() {
  const path = usePathname();
  const [liveCount, setLiveCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/live")
        .then((r) => r.json())
        .then((d) => alive && setLiveCount((d.matches ?? []).filter((m: { status: string }) => m.status === "live").length))
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <header className="glass fixed inset-x-0 top-0 z-50 border-b border-black/5">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1d1d1f] text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 20l6-6M14 4l6 6M9 15l6-6M6 18l-2 2M18 6l2-2" />
              <circle cx="18" cy="18" r="2.5" />
            </svg>
          </span>
          CrickIQ
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-[#1d1d1f]/80 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`transition hover:text-[#1d1d1f] ${path.startsWith(l.href) ? "text-[#1d1d1f] font-medium" : ""}`}>
              {l.label}
              {l.href === "/live" && liveCount ? (
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-[#ff3b30]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#ff3b30]">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#ff3b30]" />
                  {liveCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-full px-3 py-1 text-xs ${path.startsWith(l.href) ? "bg-[#1d1d1f] text-white" : "text-[#1d1d1f]/70"}`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
