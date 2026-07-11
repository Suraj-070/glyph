"use client";
import { Tile } from "./tile";
import type { TileStatus, GuessResult } from "@/lib/types";
import { classNames } from "@/lib/api";

interface WordleBoardProps {
  guesses: GuessResult[];
  current: string;
  maxGuesses: number;
  wordLength: number;
  revealing: boolean;
  shakingRow: boolean;
  size?: "sm" | "md" | "lg";
  // rows already finalized reveal their colors; the current typing row shows letters as tbd
  revealAll?: boolean;
}

export function WordleBoard({
  guesses,
  current,
  maxGuesses,
  wordLength,
  revealing,
  shakingRow,
  size = "md",
  revealAll = true,
}: WordleBoardProps) {
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < maxGuesses; r++) {
    const guess = guesses[r];
    const isCurrentRow = r === guesses.length && !guess;
    const isShaking = isCurrentRow && shakingRow;

    const cells: React.ReactNode[] = [];
    for (let c = 0; c < wordLength; c++) {
      let letter: string | undefined;
      let st: TileStatus = "empty";
      let isRevealing = false;
      let pop = false;

      if (guess) {
        letter = guess.guess[c];
        st = guess.statuses[c] ?? "empty";
        // only reveal if this row is fully submitted
        isRevealing = revealAll;
      } else if (isCurrentRow) {
        letter = current[c];
        st = letter ? "tbd" : "empty";
        pop = !!letter && c === current.length - 1;
      }

      cells.push(
        <Tile
          key={c}
          letter={letter}
          status={st}
          index={c}
          reveal={isRevealing && !!guess}
          size={size}
          pop={pop}
        />
      );
    }

    rows.push(
      <div
        key={r}
        className={classNames(
          "flex gap-1.5",
          isShaking && "animate-shake"
        )}
      >
        {cells}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-center">{rows}</div>
  );
}
