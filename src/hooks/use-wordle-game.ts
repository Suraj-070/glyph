"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GuessResult, TileStatus } from "@/lib/types";
import { computeKeyStates } from "@/lib/game";
import { api } from "@/lib/api";

export interface UseWordleOptions {
  seed: string | null;
  maxGuesses: number;
  mode: string;
  // callback when a guess is finalized (for opponent progress relay in duel)
  onGuessFinalized?: (result: GuessResult, attempt: number, won: boolean, finished: boolean) => void;
  // callback when the game ends
  onGameEnd?: (result: GameEndResult) => void;
  // external lock (e.g. waiting for duel start)
  locked?: boolean;
}

export interface GameEndResult {
  won: boolean;
  guessesUsed: number;
  durationMs: number;
  word: string;
  guesses: GuessResult[];
}

export interface WordleState {
  guesses: GuessResult[];
  current: string;
  status: "idle" | "playing" | "won" | "lost";
  error: string | null;
  shakingRow: boolean;
  revealing: boolean;
}

const WORD_LENGTH = 5;

export function useWordleGame(opts: UseWordleOptions) {
  const { seed, maxGuesses, mode, onGuessFinalized, onGameEnd, locked } = opts;
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<"idle" | "playing" | "won" | "lost">(
    seed ? "playing" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [shakingRow, setShakingRow] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [finalWord, setFinalWord] = useState<string | null>(null);

  const startRef = useRef<number>(Date.now());
  const endedRef = useRef(false);

  // reset when seed changes
  useEffect(() => {
    setGuesses([]);
    setCurrent("");
    setStatus(seed ? "playing" : "idle");
    setError(null);
    setFinalWord(null);
    endedRef.current = false;
    startRef.current = Date.now();
  }, [seed]);

  const keyStates = computeKeyStates(guesses);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setShakingRow(true);
    setTimeout(() => setShakingRow(false), 500);
    setTimeout(() => setError(null), 1800);
  }, []);

  const submitGuess = useCallback(async () => {
    if (locked || status !== "playing" || !seed) return;
    if (current.length !== WORD_LENGTH) {
      showError("Not enough letters");
      return;
    }
    setRevealing(true);
    try {
      const attempt = guesses.length + 1;
      const res = await api<{
        statuses: TileStatus[];
        guess: string;
        result: string;
        won: boolean;
        finished: boolean;
        word?: string;
        invalid?: boolean;
      }>("/api/words/validate", {
        method: "POST",
        body: JSON.stringify({ seed, guess: current, attempt }),
      });

      if (res.invalid) {
        showError("Not in word list");
        setRevealing(false);
        return;
      }

      const newGuess: GuessResult = { guess: res.guess, statuses: res.statuses };
      const newGuesses = [...guesses, newGuess];
      setGuesses(newGuesses);
      setCurrent("");

      // wait for flip animation before finalizing
      setTimeout(() => {
        setRevealing(false);
        onGuessFinalized?.(newGuess, attempt, res.won, res.finished);

        if (res.won) {
          setStatus("won");
          if (!endedRef.current) {
            endedRef.current = true;
            const durationMs = Date.now() - startRef.current;
            onGameEnd?.({
              won: true,
              guessesUsed: attempt,
              durationMs,
              word: res.word || "",
              guesses: newGuesses,
            });
          }
        } else if (res.finished) {
          setStatus("lost");
          if (!endedRef.current) {
            endedRef.current = true;
            const durationMs = Date.now() - startRef.current;
            onGameEnd?.({
              won: false,
              guessesUsed: attempt,
              durationMs,
              word: res.word || "",
              guesses: newGuesses,
            });
          }
        }
      }, 500 + WORD_LENGTH * 180);
    } catch (e) {
      setRevealing(false);
      showError(e instanceof Error ? e.message : "Validation failed");
    }
  }, [locked, status, seed, current, guesses, onGuessFinalized, onGameEnd, showError]);

  const onKey = useCallback(
    (key: string) => {
      if (locked || status !== "playing" || revealing) return;
      if (key === "ENTER") {
        submitGuess();
        return;
      }
      if (key === "BACKSPACE" || key === "DEL") {
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[A-Z]$/.test(key) && current.length < WORD_LENGTH) {
        setCurrent((c) => c + key);
      }
    },
    [locked, status, revealing, current, submitGuess]
  );

  // physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked || status !== "playing") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (k === "ENTER") {
        e.preventDefault();
        onKey("ENTER");
      } else if (k === "BACKSPACE") {
        e.preventDefault();
        onKey("BACKSPACE");
      } else if (/^[A-Z]$/.test(k)) {
        onKey(k);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onKey, locked, status]);

  return {
    guesses,
    current,
    status,
    error,
    shakingRow,
    revealing,
    finalWord,
    keyStates,
    onKey,
    maxGuesses,
    wordLength: WORD_LENGTH,
    mode,
    elapsedMs: status === "playing" ? Date.now() - startRef.current : 0,
  };
}
