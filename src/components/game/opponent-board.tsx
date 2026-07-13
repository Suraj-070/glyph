"use client";
// CSS-only — framer-motion removed (mobile perf). Includes OpponentStrip:
// compact single-row progress for phone layouts.
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

function cellClass(st: TileStatus): string {
  return st === "correct"
    ? "tile-correct border-transparent"
    : st === "present"
    ? "tile-present border-transparent"
    : st === "absent"
    ? "tile-absent border-transparent"
    : st === "tbd"
    ? "tile-tbd"
    : "tile-empty";
}

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
      } else if (r === rows.length && typing) {
        st = "tbd";
        isTypingCell = true;
      }
      cells.push(
        <div
          key={c}
          className={classNames(
            "border-2 flex items-center justify-center",
            SIZES[size],
            cellClass(st),
            isReveal && (st === "correct" || st === "present" || st === "absent") && "animate-tile-flip",
            isTypingCell && "animate-pulse"
          )}
          style={isReveal ? { animationDelay: `${c * 0.1}s` } : undefined}
        >
          {st === "correct" ? (
            <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" className="opacity-90">
              <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : st === "present" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          ) : null}
        </div>
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
      {won && (
        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10 rounded-lg backdrop-blur-[2px] animate-fade-in">
          <span className="text-emerald-300 font-bold text-xs uppercase tracking-wider">Solved</span>
        </div>
      )}
      {lost && !won && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10 rounded-lg backdrop-blur-[2px] animate-fade-in">
          <span className="text-rose-300 font-bold text-xs uppercase tracking-wider">Out</span>
        </div>
      )}
    </div>
  );
}

/**
 * OpponentStrip — phone-sized: one row, latest guess colors + attempt count.
 * Shows opponent presence without eating half the viewport.
 */
export function OpponentStrip({
  name,
  rows,
  maxGuesses,
  wordLength,
  typing,
  won,
  lost,
}: {
  name: string;
  rows: OpponentRow[];
  maxGuesses: number;
  wordLength: number;
  typing?: boolean;
  won?: boolean;
  lost?: boolean;
}) {
  const last = rows.length ? rows[rows.length - 1] : null;
  return (
    <div className="flex items-center gap-2 glass rounded-lg px-2.5 py-1.5 w-full max-w-lg mx-auto">
      <span className="text-xs font-semibold truncate flex-1 min-w-0">{name}</span>
      {typing ? (
        <span className="flex gap-0.5 shrink-0">
          <span className="w-1 h-1 rounded-full bg-teal animate-bounce" />
          <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "120ms" }} />
          <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "240ms" }} />
        </span>
      ) : null}
      <div className="flex gap-0.5 shrink-0">
        {Array.from({ length: wordLength }).map((_, c) => (
          <span
            key={c}
            className={classNames("w-3.5 h-3.5 rounded-sm border", cellClass(last?.statuses[c] ?? "empty"))}
          />
        ))}
      </div>
      <span
        className={classNames(
          "text-[10px] font-bold shrink-0 tabular-nums",
          won ? "text-emerald-300" : lost ? "text-rose-300" : "text-muted-foreground"
        )}
      >
        {won ? "SOLVED" : lost ? "OUT" : `${rows.length}/${maxGuesses}`}
      </span>
    </div>
  );
}
