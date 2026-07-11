"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { TileStatus } from "@/lib/types";
import { classNames } from "@/lib/api";

export interface OpponentRow {
  statuses: TileStatus[];
  final: boolean;
}

interface OpponentBoardProps {
  rows: OpponentRow[];
  maxGuesses: number;
  wordLength: number;
  typing?: boolean;
  won?: boolean;
  lost?: boolean;
  size?: "sm" | "md";
}

const SIZES = {
  sm: "w-7 h-7 rounded",
  md: "w-10 h-10 rounded-md",
};

export function OpponentBoard({
  rows,
  maxGuesses,
  wordLength,
  typing,
  won,
  lost,
  size = "sm",
}: OpponentBoardProps) {
  const display: React.ReactNode[] = [];
  for (let r = 0; r < maxGuesses; r++) {
    const row = rows[r];
    const cells: React.ReactNode[] = [];
    for (let c = 0; c < wordLength; c++) {
      let st: TileStatus = "empty";
      let isReveal = false;
      let isTypingCell = false;
      if (row) {
        st = row.statuses[c] ?? "empty";
        isReveal = row.final;
      } else if (r === rows.length && typing && c < wordLength) {
        // show a subtle typing shimmer on the current row
        st = "tbd";
        isTypingCell = true;
      }
      const statusClass =
        st === "correct"
          ? "tile-correct border-transparent"
          : st === "present"
          ? "tile-present border-transparent"
          : st === "absent"
          ? "tile-absent border-transparent"
          : st === "tbd"
          ? "tile-tbd"
          : "tile-empty";

      cells.push(
        <motion.div
          key={c}
          className={classNames(
            "border-2 flex items-center justify-center",
            SIZES[size],
            statusClass
          )}
          animate={
            isReveal && (st === "correct" || st === "present" || st === "absent")
              ? { rotateX: [0, 90, 0], scale: [1, 1.05, 1] }
              : isTypingCell
              ? { opacity: [0.4, 1, 0.4] }
              : {}
          }
          transition={
            isReveal
              ? { duration: 0.45, delay: c * 0.12 }
              : { duration: 1.2, repeat: isTypingCell ? Infinity : 0 }
          }
          style={{ transformStyle: "preserve-3d" }}
        >
          {st === "correct" ? (
            <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" className="opacity-90">
              <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : st === "present" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          ) : null}
        </motion.div>
      );
    }
    display.push(
      <div key={r} className="flex gap-1">
        {cells}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1 items-center">
      {display}
      <AnimatePresence>
        {won && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 rounded-lg backdrop-blur-[2px]"
          >
            <span className="text-emerald-300 font-bold text-xs uppercase tracking-wider">Solved</span>
          </motion.div>
        )}
        {lost && !won && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-rose-500/10 rounded-lg backdrop-blur-[2px]"
          >
            <span className="text-rose-300 font-bold text-xs uppercase tracking-wider">Out</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
