import { SectionTitle } from "@/components/ui";
import LiveBoard from "./LiveBoard";

export const dynamic = "force-dynamic";

export default function LivePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <SectionTitle eyebrow="Live tracking" title="Every ball, as it happens." sub="Scores refresh automatically every few seconds. Worm charts and run-rate analytics update live." />
      <LiveBoard />
    </div>
  );
}
