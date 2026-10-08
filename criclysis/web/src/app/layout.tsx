import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "CrickIQ — Cricket Analytics, Reimagined",
  description:
    "Career-long analytics, strengths & weaknesses, interactive charts, live match tracking and AI-style strategy planning for every international cricketer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="pt-14">{children}</main>
        <footer className="mt-24 border-t border-black/5 bg-[#f5f5f7]">
          <div className="mx-auto max-w-6xl px-6 py-10 text-xs text-[#6e6e73]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="font-semibold text-[#1d1d1f]">CrickIQ</p>
              <nav className="flex flex-wrap gap-5">
                <Link href="/players" className="hover:text-[#1d1d1f]">Players</Link>
                <Link href="/compare" className="hover:text-[#1d1d1f]">Compare</Link>
                <Link href="/strategy" className="hover:text-[#1d1d1f]">Strategy</Link>
                <Link href="/live" className="hover:text-[#1d1d1f]">Live</Link>
              </nav>
            </div>
            <p className="mt-6 max-w-3xl leading-relaxed">
              Career data is sourced from public records (ESPNcricinfo Statsguru, ICC rankings and other cricket databases) and refreshed by the ingestion
              layer. Live scores use the ESPNcricinfo match feed or CricAPI when available, and otherwise fall back to a ball-by-ball simulation engine.
              Ratings, form indices and strategy plans are model outputs and not official statistics.
            </p>
            <p className="mt-4">© {new Date().getFullYear()} CrickIQ. Not affiliated with the ICC or ESPN.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
