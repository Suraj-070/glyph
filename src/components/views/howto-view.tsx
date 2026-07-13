"use client";
import { motion } from "framer-motion";
import { Target, Swords, Users, Dumbbell, Zap, Flame, Trophy, Sparkles, Lock, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGlyph } from "@/lib/store";

export function HowToView() {
  const setView = useGlyph((s) => s.setView);
  const startDuel = useGlyph((s) => s.startDuel);

  const rules = [
    { icon: "🟩", title: "Green tile", desc: "The letter is in the word AND in the correct spot." },
    { icon: "🟨", title: "Yellow tile", desc: "The letter is in the word but in the wrong spot." },
    { icon: "⬛", title: "Gray tile", desc: "The letter is not in the word at all." },
  ];

  const modes = [
    { icon: Target, name: "Daily Challenge", color: "#2dd4bf", desc: "One global word per day. Keep your streak alive. Challenge & Hardcore days offer bonus XP.", cta: "Play daily" },
    { icon: Swords, name: "Real-time Duel", color: "#fb7185", desc: "1v1 live. Same word. First to decode wins. Ties broken by fewer guesses, then time.", cta: "Start duel" },
    { icon: Users, name: "Party Mode", color: "#a78bfa", desc: "2–20 players in a live arena. Leaderboard updates in real time. Spectator mode included.", cta: "Coming soon" },
    { icon: Dumbbell, name: "Practice", color: "#fbbf24", desc: "Unlimited random words with AI hints. No streak impact. Train your vocabulary.", cta: "Practice" },
  ];

  const features = [
    { icon: Flame, title: "Streak System", desc: "Daily streaks, win streaks, streak freezes & comeback rewards. 7/30/100-day badges." },
    { icon: Trophy, title: "Competitive Ranks", desc: "Beginner → Bronze → Silver → Gold → Platinum → Diamond → Master. Climb with wins & speed." },
    { icon: Sparkles, title: "GLYPH AI", desc: "After every game, get the word's meaning, fun fact & example. Practice mode offers progressive hints." },
    { icon: Radio, title: "Real-time Presence", desc: "See friends online, challenge instantly, chat & react during matches — Discord-style." },
    { icon: Lock, title: "Anti-Cheat", desc: "Secret words live server-side only. Opponent letters are never transmitted. Validation is authoritative." },
    { icon: Zap, title: "XP & Progression", desc: "Earn XP from every game. Level up. Unlock achievements. Track guess distributions & best times." },
  ];

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-teal to-violet items-center justify-center font-black text-black text-2xl mb-3">
          G
        </div>
        <h2 className="text-3xl font-black">How to Play GLYPH</h2>
        <p className="text-muted-foreground mt-2 text-sm max-w-xl mx-auto">
          Decode the 5-letter grid in 6 guesses or fewer. Compete daily, duel live, and climb the ranks.
        </p>
      </motion.div>

      {/* tile rules */}
      <section className="glass rounded-2xl p-5">
        <h3 className="font-bold mb-4">The Grid Rules</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {rules.map((r) => (
            <div key={r.title} className="glass rounded-xl p-4 text-center">
              <div className="text-4xl mb-2">{r.icon}</div>
              <div className="font-semibold text-sm">{r.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 glass rounded-xl p-4 flex items-center gap-4 justify-center flex-wrap">
          <div className="flex gap-1">
            {["C", "R", "A", "N", "E"].map((l, i) => (
              <div
                key={i}
                className={`h-10 w-10 rounded-md border-2 flex items-center justify-center font-bold ${
                  i === 0 ? "tile-correct border-transparent" : "tile-empty"
                }`}
              >
                {l}
              </div>
            ))}
          </div>
          <span className="text-muted-foreground text-sm">→</span>
          <span className="text-sm">"C" is correct & in place. Others are absent.</span>
        </div>
      </section>

      {/* game modes */}
      <section>
        <h3 className="font-bold mb-4 text-lg">Game Modes</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {modes.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl p-4 flex items-start gap-3"
              >
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{m.name}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                  {m.cta !== "Coming soon" ? (
                    <button
                      onClick={() => {
                        if (m.name === "Daily Challenge") setView("classic");
                        else if (m.name === "Real-time Duel") startDuel(Math.random().toString(36).slice(2, 8).toUpperCase());
                        else if (m.name === "Practice") setView("practice");
                      }}
                      className="text-xs text-teal font-semibold mt-2 hover:underline"
                    >
                      {m.cta} →
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground mt-2 inline-block">
                      {m.cta}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* features */}
      <section>
        <h3 className="font-bold mb-4 text-lg">Platform Features</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-xl p-4"
              >
                <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center mb-2 text-teal">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="font-semibold text-sm">{f.title}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <div className="text-center pt-2">
        <Button
          size="lg"
          className="bg-teal text-teal-foreground hover:bg-teal/90"
          onClick={() => setView("classic")}
        >
          <Target className="h-4 w-4 mr-2" /> Start with today's challenge
        </Button>
      </div>
    </div>
  );
}
