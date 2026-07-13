"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Timer } from "lucide-react";
import { formatTime } from "@/lib/api";

interface GameTimerProps {
  startedAt: number | null;
  running: boolean;
  className?: string;
}

export function GameTimer({ startedAt, running, className = "" }: GameTimerProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running || !startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running, startedAt]);

  const ms = startedAt ? now - startedAt : 0;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 glass font-mono text-sm ${className}`}
    >
      <Timer className="h-3.5 w-3.5 text-teal" />
      <motion.span
        key={Math.floor(ms / 1000)}
        initial={{ opacity: 0.5, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        className="tabular-nums"
      >
        {formatTime(ms)}
      </motion.span>
    </div>
  );
}

interface CountdownProps {
  ms: number;
  className?: string;
}

export function Countdown({ ms, className = "" }: CountdownProps) {
  // Component is remounted via `key` by the parent when `ms` changes,
  // so a lazy initializer is enough — no setState-in-effect needed.
  const [remaining, setRemaining] = useState(ms);
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
