"use client";
import { useMemo } from "react";

interface ConfettiProps {
  active: boolean;
  count?: number;
}

const COLORS = ["#2dd4bf", "#a78bfa", "#fbbf24", "#34d399", "#fb7185", "#67e8f9"];

export function Confetti({ active, count = 80 }: ConfettiProps) {
  // Derive pieces purely from `active` — no setState in effect.
  // When active flips true, a fresh batch is generated; when false, empty.
  const pieces = useMemo(() => {
    if (!active) return [] as { left: number; delay: number; duration: number; color: string; size: number; rot: number }[];
    return Array.from({ length: count }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.8 + Math.random() * 1.6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      rot: Math.random() * 360,
    }));
  }, [active, count]);

  if (!active || pieces.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            backgroundColor: p.color,
            transform: `rotate(${p.rot}deg)`,
            borderRadius: 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            boxShadow: `0 0 8px ${p.color}66`,
          }}
        />
      ))}
    </div>
  );
}
