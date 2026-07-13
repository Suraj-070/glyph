"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, BookOpen, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";

interface WordExplainProps {
  word: string;
  compact?: boolean;
}

interface ExplainData {
  word: string;
  meaning: string;
  funFact: string;
  partOfSpeech: string;
  example: string;
}

export function WordExplain({ word, compact = false }: WordExplainProps) {
  const [data, setData] = useState<ExplainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    api<ExplainData>("/api/ai/explain", {
      method: "POST",
      body: JSON.stringify({ word }),
    })
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [word]);

  const fetchHint = async (level: number) => {
    setHintLoading(level);
    try {
      const res = await api<{ level: number; hint: string }>("/api/ai/hint", {
        method: "POST",
        body: JSON.stringify({ word, level }),
      });
      setHint(res.hint);
    } catch {
      setHint("Hint unavailable.");
    } finally {
      setHintLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-teal" />
          GLYPH AI is decoding the word…
        </div>
        <div className="h-3 w-3/4 rounded shimmer" />
        <div className="h-3 w-1/2 rounded shimmer" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-teal/15 text-teal">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            GLYPH AI · Word Insight
          </div>
          <div className="font-bold text-lg text-gradient">
            {word}
            {data?.partOfSpeech ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground italic">
                {data.partOfSpeech}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {data?.meaning ? (
        <p className="text-sm text-foreground/90 leading-relaxed">
          <BookOpen className="inline h-3.5 w-3.5 mr-1 text-violet -mt-0.5" />
          {data.meaning}
        </p>
      ) : null}

      {data?.example ? (
        <p className="text-sm text-muted-foreground italic border-l-2 border-violet/40 pl-3">
          “{data.example}”
        </p>
      ) : null}

      {data?.funFact ? (
        <div className="rounded-lg bg-amber/10 border border-amber/20 px-3 py-2 text-xs text-amber/90">
          <span className="font-semibold">Did you know? </span>
          {data.funFact}
        </div>
      ) : null}

      {!compact ? (
        <div className="pt-1">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-3.5 w-3.5 text-amber" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Hints (Practice only)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                onClick={() => fetchHint(lvl)}
                disabled={hintLoading !== null}
                className="text-xs px-2.5 py-1 rounded-md glass hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {hintLoading === lvl ? "…" : `Hint ${"·".repeat(lvl)}`}
              </button>
            ))}
          </div>
          {hint ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 text-sm text-foreground/90 bg-white/5 rounded-lg px-3 py-2"
            >
              {hint}
            </motion.div>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
