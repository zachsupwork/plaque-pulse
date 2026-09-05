import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The ambient field: a bright cloud-white page wash inspired by the plaque
 * face. Static — no drifting orbs, no tilted planes behind body copy.
 */
export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("field relative min-h-screen w-full overflow-hidden", className)}>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Primary content surface: clean acrylic-white, soft shadow, thin border. */
export function GlassPanel({
  children,
  className,
  tone = "default",
  sheen: _sheen,
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "quiet" | "brand" | "signal" | "frost";
  /** @deprecated animated sheen was removed from reading surfaces */
  sheen?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "surface",
    quiet: "surface-quiet",
    brand: "surface-brand",
    signal: "surface-signal",
    frost: "surface-frost",
  };
  return <div className={cn("relative rounded-2xl", tones[tone], className)}>{children}</div>;
}

/** White card wrapped in the thin multicolour plaque edge. */
export function EdgePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="gradient-edge shadow-[var(--shadow-soft)]">
      <div className={cn("rounded-[1.3rem] bg-card", className)}>{children}</div>
    </div>
  );
}


export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <h2 className="font-display text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function TrendPill({ changePct, size = "md" }: { changePct: number | null; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]";
  if (changePct === null) {
    return (
      <span className={cn("rounded-full border border-border bg-foreground/5 font-semibold text-muted-foreground", pad)}>
        No comparison yet
      </span>
    );
  }
  const up = changePct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-bold",
        pad,
        up
          ? "border-accent/35 bg-accent/15 text-accent"
          : "border-destructive/35 bg-destructive/15 text-destructive",
      )}
    >
      {up ? "↑" : "↓"}
      {Math.abs(changePct)}%
    </span>
  );
}

export type StatusTone = "ok" | "attention" | "problem" | "idle" | "brand";

export function StatusChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const map: Record<StatusTone, string> = {
    ok: "border-accent/35 bg-accent/15 text-accent",
    brand: "border-primary/40 bg-primary/15 text-primary",
    attention: "border-warning/40 bg-warning/15 text-warning",
    problem: "border-destructive/40 bg-destructive/15 text-destructive",
    idle: "border-border bg-foreground/5 text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold", map[tone])}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-[var(--shadow-soft)]">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display font-bold tracking-tight",
          tone === "muted" ? "text-[13px] leading-snug text-muted-foreground" : "text-[22px] leading-none",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
