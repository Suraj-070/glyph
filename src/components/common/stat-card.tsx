"use client";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string; // hex
  delay?: number;
}

export function StatCard({ icon: Icon, label, value, sub, accent = "#2dd4bf", delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="glass rounded-xl p-4 relative overflow-hidden group"
    >
      <div
        className="absolute -top-6 -right-6 h-20 w-20 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between relative">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
          {sub ? (
            <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
          ) : null}
        </div>
        <div
          className="flex items-center justify-center h-9 w-9 rounded-lg"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}
