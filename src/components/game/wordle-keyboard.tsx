"use client";
import type { TileStatus } from "@/lib/types";
import { classNames } from "@/lib/api";
import { Delete, CornerDownLeft } from "lucide-react";

interface WordleKeyboardProps {
  onKey: (key: string) => void;
  keyStates: Record<string, TileStatus>;
  disabled?: boolean;
}

const ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
];

function keyClass(status: TileStatus | undefined): string {
  if (status === "correct") return "tile-correct border-transparent";
  if (status === "present") return "tile-present border-transparent";
  if (status === "absent") return "bg-[#07080a] text-[#1e2028] border-[#12131a]";
  return "bg-white/5 hover:bg-white/10 border-white/10 text-foreground";
}

export function WordleKeyboard({ onKey, keyStates, disabled }: WordleKeyboardProps) {
  return (
    <div className="flex flex-col gap-1 sm:gap-1.5 w-full max-w-lg mx-auto select-none touch-manipulation px-0.5">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1.5 justify-center">
          {row.map((k) => {
            const isAction = k === "ENTER" || k === "DEL";
            const st = keyStates[k];
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!disabled) onKey(k);
                }}
                className={classNames(
                  "h-12 sm:h-12 rounded-md border font-semibold uppercase text-sm active:scale-95 active:bg-white/15 transition-transform duration-75",
                  isAction ? "px-2 text-xs flex-[1.4] sm:flex-none sm:px-4" : "flex-1 max-w-[44px]",
                  keyClass(st),
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                aria-label={k}
              >
                {k === "DEL" ? <Delete className="h-4 w-4" /> : k === "ENTER" ? (
                  <span className="flex items-center gap-1">
                    <CornerDownLeft className="h-3.5 w-3.5" /> GUESS
                  </span>
                ) : (
                  k
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}