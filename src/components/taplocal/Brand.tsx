import { cn } from "@/lib/utils";

/**
 * TapLocal brand mark: a multicolour location pin, matching the gradient edge
 * printed on the physical SmartPlaques.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id="tl-pin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3478F6" />
          <stop offset="38%" stopColor="#7B5BF0" />
          <stop offset="70%" stopColor="#F2568F" />
          <stop offset="100%" stopColor="#F5A524" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5c-5.6 0-10.2 4.5-10.2 10.1 0 7.4 9 15.9 9.4 16.3.5.4 1.2.4 1.7 0 .4-.4 9.3-8.9 9.3-16.3C26.2 7 21.6 2.5 16 2.5Z"
        fill="url(#tl-pin)"
      />
      <circle cx="16" cy="12.4" r="4.1" fill="#fff" />
    </svg>
  );
}

export function BrandLockup({
  suffix,
  className,
}: {
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark className="h-7 w-7" />
      <span className="font-display text-[16px] font-bold tracking-tight">
        TapLocal
        {suffix ? <span className="ml-1 font-medium text-muted-foreground">{suffix}</span> : null}
      </span>
    </span>
  );
}

/** Large clean contactless mark, as printed on the plaque face. */
export function NfcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("h-10 w-10", className)} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3">
        <path d="M17 15a13 13 0 0 1 0 18" opacity="0.35" />
        <path d="M24 11a19 19 0 0 1 0 26" opacity="0.6" />
        <path d="M31 7a25 25 0 0 1 0 34" />
      </g>
    </svg>
  );
}
