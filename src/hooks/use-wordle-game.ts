"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GuessResult, TileStatus } from "@/lib/types";
import { computeKeyStates } from "@/lib/game";
import { api } from "@/lib/api";

export interface UseWordleOptions {
  seed: string | null;
  /** Restore a refreshed game: newest token + already-revealed guesses. */
  resume?: { token: string; guesses: GuessResult[]; startedAt?: number } | null;
  /** Called when the server says the session token is invalid/expired. */
  onSessionExpired?: () => void;
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
  const { seed, maxGuesses, mode, onGuessFinalized, onGameEnd, locked = false, resume, onSessionExpired } = opts;
  // rotating signed token — starts as the issued token, replaced on every guess
  const tokenRef = useRef<string | null>(seed);
  const lockedRef = useRef(locked);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
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

  // reset when seed changes (or hydrate from a resume snapshot)
  useEffect(() => {
    if (resume && seed && resume.token) {
      tokenRef.current = resume.token;      // newest rotated token, not the issued one
      setGuesses(resume.guesses);
      setStatus(resume.guesses.length >= maxGuesses ? "lost" : "playing");
      startRef.current = resume.startedAt ?? Date.now();
    } else {
      tokenRef.current = seed;
      setGuesses([]);
      startRef.current = Date.now();
      setStatus(seed ? "playing" : "idle");
    }
    setCurrent("");
    setError(null);
    setFinalWord(null);
    endedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        token?: string;
      }>("/api/words/validate", {
        method: "POST",
        body: JSON.stringify({ token: tokenRef.current, guess: current }),
      });

      if (res.token) tokenRef.current = res.token;
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
      const httpStatus = (e as Error & { status?: number }).status;
      if (httpStatus === 404) {
        showError("Session expired");
        onSessionExpired?.();
      } else if (httpStatus === undefined) {
        // network failure — typed word stays in the row, ENTER retries safely
        showError("Connection lost — press Enter to retry");
      } else {
        showError(e instanceof Error ? e.message : "Validation failed");
      }
    }
  }, [locked, status, seed, current, guesses, onGuessFinalized, onGameEnd, onSessionExpired, showError]);

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
      if (lockedRef.current || status !== "playing") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // ignore keystrokes when user is typing in chat / any input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
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
    getToken: () => tokenRef.current,
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