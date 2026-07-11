"use client";
import { motion } from "framer-motion";
import type { TileStatus } from "@/lib/types";

interface TileProps {
  letter?: string;
  status: TileStatus;
  // index within the row, used for staggered flip delay
  index?: number;
  // whether this row is currently being submitted (trigger flip)
  reveal?: boolean;
  size?: "sm" | "md" | "lg";
  // for opponent board: no letters shown
  hideLetter?: boolean;
  // pop animation when typing
  pop?: boolean;
}

const SIZES = {
  sm: "w-9 h-9 text-base rounded-md",
  md: "w-14 h-14 text-2xl rounded-lg",
  lg: "w-16 h-16 text-3xl rounded-lg",
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

  // Flip animation only when revealing a finalized result
  const shouldFlip = reveal && (status === "correct" || status === "present" || status === "absent");

  return (
    <motion.div
      className={`relative flex items-center justify-center font-bold border-2 select-none ${SIZES[size]} ${statusClass}`}
      animate={
        shouldFlip
          ? { rotateX: [0, 90, 0] }
          : pop
          ? { scale: [1, 1.12, 1] }
          : { rotateX: 0, scale: 1 }
      }
      transition={
        shouldFlip
          ? { duration: 0.5, delay: index * 0.18, ease: "easeInOut" }
          : pop
          ? { duration: 0.12 }
          : { duration: 0.15 }
      }
      style={{ transformStyle: "preserve-3d" }}
    >
      <span className={hideLetter ? "opacity-0" : "opacity-100"}>
        {letter || ""}
      </span>
      {/* For opponent color-only board, show a subtle glyph when there is a status */}
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
    </motion.div>
  );
}
