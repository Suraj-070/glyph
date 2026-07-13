"use client";
import { RANKS, type RankInfo } from "@/lib/types";

interface RankBadgeProps {
  tier: string;
  label?: string;
  points?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function rankByTier(tier: string): RankInfo {
  return RANKS.find((r) => r.tier === tier) ?? RANKS[0];
}

export function RankBadge({
  tier,
  label,
  points,
  size = "md",
  showLabel = true,
}: RankBadgeProps) {
  const rank = rankByTier(tier);
  const sz =
    size === "sm" ? "h-5 px-2 text-[10px]"
    : size === "lg" ? "h-8 px-3 text-sm"
    : "h-6 px-2.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide ${sz}`}
      style={{
        color: rank.color,
        background: `${rank.color}1a`,
        border: `1px solid ${rank.color}40`,
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: size === "sm" ? 6 : 8,
          height: size === "sm" ? 6 : 8,
          backgroundColor: rank.color,
          boxShadow: `0 0 8px ${rank.color}`,
        }}
      />
      {showLabel ? label || rank.label : null}
      {typeof points === "number" ? (
        <span className="opacity-60 normal-case font-mono">{points}</span>
      ) : null}
    </span>
  );
}

const RANK_ICONS: Record<string, string> = {
  beginner: "○",
  bronze: "▲",
  silver: "◆",
  gold: "★",
  platinum: "✦",
  diamond: "♦",
  master: "♛",
};

export function RankIcon({ tier, size = 18 }: { tier: string; size?: number }) {
  const rank = rankByTier(tier);
  return (
    <span
      style={{ color: rank.color, fontSize: size, lineHeight: 1 }}
      aria-hidden
    >
      {RANK_ICONS[rank.tier] ?? "●"}
    </span>
  );
}
