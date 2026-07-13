"use client";
// CSS-only animations — framer-motion removed: per-tile motion components caused
// mobile jank (same fix as ShiftTracker). Flip stagger via animation-delay.
import type { TileStatus } from "@/lib/types";
import { classNames } from "@/lib/api";

interface TileProps {
  letter?: string;
  status: TileStatus;
  index?: number;
  reveal?: boolean;
  size?: "sm" | "md" | "lg";
  hideLetter?: boolean;
  pop?: boolean;
}

// Responsive: smaller tiles on phones so 6 rows + keyboard fit one viewport
const SIZES = {
  sm: "w-8 h-8 text-sm sm:w-9 sm:h-9 sm:text-base rounded-md",
  md: "w-[11.5vw] h-[11.5vw] max-w-14 max-h-14 text-xl sm:w-14 sm:h-14 sm:text-2xl rounded-lg",
  lg: "w-14 h-14 text-2xl sm:w-16 sm:h-16 sm:text-3xl rounded-lg",
};

export function Tile({
  letter,
  status,
  index = 0,
  reveal = false,
  size = "md",
  hideLetter = false,
  pop = false,
}: TileProps) {
  const statusClass =
    status === "correct"
      ? "tile-correct"
      : status === "present"
      ? "tile-present"
      : status === "absent"
      ? "tile-absent"
      : letter
      ? "tile-tbd"
      : "tile-empty";

  const shouldFlip =
    reveal && (status === "correct" || status === "present" || status === "absent");

  return (
    <div
      className={classNames(
        "relative flex items-center justify-center font-bold border-2 select-none",
        SIZES[size],
        statusClass,
        shouldFlip && "animate-tile-flip",
        !shouldFlip && pop && "animate-tile-pop"
      )}
      style={shouldFlip ? { animationDelay: `${index * 0.14}s` } : undefined}
    >
      <span className={hideLetter ? "opacity-0" : "opacity-100"}>{letter || ""}</span>
      {hideLetter && (status === "correct" || status === "present") ? (
        <span className="absolute inset-0 flex items-center justify-center opacity-90">
          {status === "correct" ? (
            <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          )}
        </span>
      ) : null}
    </div>
  );
}
