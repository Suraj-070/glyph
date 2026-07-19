"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, User, Eye, EyeOff, Zap, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export interface SessionPlayer {
  id: string;
  username: string;
  avatarSeed: string;
  email: string | null;
  xp: number;
  level: number;
  rankPoints: number;
  status: string;
  authProvider: string;
}

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (player: SessionPlayer) => void;
  defaultTab?: "login" | "register";
}

export function AuthModal({ open, onClose, onSuccess, defaultTab = "login" }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const reset = () => { setError(null); setEmail(""); setPassword(""); setUsername(""); setShowPw(false); };

  const switchTab = (t: "login" | "register") => { setTab(t); setError(null); };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { email, password };
      if (tab === "register" && username.trim()) body.username = username.trim();
      const player = await api<SessionPlayer>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      reset();
      onSuccess(player);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") submit(); };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="glass-strong rounded-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="relative px-6 pt-7 pb-5 text-center bg-gradient-to-b from-teal/15 to-transparent rounded-t-2xl">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-teal to-violet flex items-center justify-center mb-3 font-black text-black text-2xl shadow-lg">
                G
              </div>
              <h2 className="text-xl font-bold">
                {tab === "login" ? "Welcome back" : "Join GLYPH"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {tab === "login"
                  ? "Sign in to save your progress & rank"
                  : "Create an account to track XP, streaks & duels"}
              </p>
            </div>

            {/* tabs */}
            <div className="flex mx-6 mt-4 rounded-xl glass p-1 gap-1">
              <button
                onClick={() => switchTab("login")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === "login" ? "bg-teal/20 text-teal" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LogIn className="h-3.5 w-3.5" /> Sign In
              </button>
              <button
                onClick={() => switchTab("register")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === "register" ? "bg-violet/20 text-violet" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" /> Register
              </button>
            </div>

            {/* form */}
            <div className="px-6 py-5 space-y-3">
              {tab === "register" && (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Username (optional)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleKey}
                    className="pl-9"
                    maxLength={20}
                  />
                </div>
              )}

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  className="pl-9"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder={tab === "register" ? "Password (min 6 chars)" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                  className="pl-9 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error && (
                <p className="text-xs text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <Button
                onClick={submit}
                disabled={loading || !email || !password}
                className="w-full bg-teal text-teal-foreground hover:bg-teal/90"
              >
                {loading ? (
                  <span className="animate-pulse">
                    {tab === "login" ? "Signing in…" : "Creating account…"}
                  </span>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    {tab === "login" ? "Sign In" : "Create Account"}
                  </>
                )}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground pb-1">
                {tab === "login" ? (
                  <>No account?{" "}
                    <button onClick={() => switchTab("register")} className="text-teal hover:underline">Register free</button>
                  </>
                ) : (
                  <>Already registered?{" "}
                    <button onClick={() => switchTab("login")} className="text-teal hover:underline">Sign in</button>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
