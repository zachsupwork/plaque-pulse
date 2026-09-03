import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The ambient signal field: dark gradient, drifting orbs and tilted glass planes. */
export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative min-h-screen w-full overflow-hidden field", className)}>
      <div className="pointer-events-none absolute -top-16 -left-10 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
      <div className="floaty pointer-events-none absolute top-40 -right-14 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
      <div className="pointer-events-none absolute top-24 left-[-10%] h-40 w-[150%] -rotate-12 rounded-3xl border border-border bg-foreground/[0.04] backdrop-blur-md" />
      <div className="pointer-events-none absolute top-40 right-[-15%] h-28 w-[150%] rotate-[9deg] rounded-3xl border border-border bg-accent/[0.06] backdrop-blur-md" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function GlassPanel({
  children,
  className,
  sheen,
}: {
  children: ReactNode;
  className?: string;
  sheen?: boolean;
}) {
  return (
    <div className={cn("glass relative overflow-hidden rounded-2xl", className)}>
      {sheen ? <div className="sheen" /> : null}
      <div className="relative">{children}</div>
    </div>
  );
}

export function TrendPill({ changePct }: { changePct: number | null }) {
  if (changePct === null) {
    return (
      <span className="rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
        New
      </span>
    );
  }
  const up = changePct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-bold",
        up ? "border-accent/30 bg-accent/15 text-accent" : "border-destructive/30 bg-destructive/15 text-destructive",
      )}
    >
      <span className="text-[12px]">{up ? "▲" : "▼"}</span>
      {Math.abs(changePct)}%
    </span>
  );
}
