import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, PlayCircle, Radio, User } from "lucide-react";
import { GlassPanel } from "./Field";
import { enterDemo } from "@/lib/demo";

/** Shown at /app when nobody is signed in. Never silently opens the sample business. */
export function WelcomeGate() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5 pt-6">
      <Link to="/" className="text-[13px] font-semibold text-muted-foreground">
        ← Back to TapLocal
      </Link>
      <div>

        <p className="text-[12px] font-semibold tracking-[0.12em] text-accent uppercase">Welcome to TapLocal</p>
        <h1 className="mt-2 font-display text-[24px] leading-tight font-bold tracking-tight text-balance">
          Let's get you into the right place
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
          Activate a plaque you've received, sign in to your business, or look around a sample account first.
        </p>
      </div>

      <Link to="/activate/$token" params={{ token: "demo-activation-token" }} className="block">
        <GlassPanel tone="brand" className="flex items-center gap-3 p-4">
          <Radio className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Activate a plaque</span>
            <span className="block text-[13px] text-muted-foreground">About a minute, no app needed.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </GlassPanel>
      </Link>

      <Link to="/auth" search={{ returnTo: "/app" }} className="block">
        <GlassPanel className="flex items-center gap-3 p-4">
          <User className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Sign in</span>
            <span className="block text-[13px] text-muted-foreground">Open your own business portal.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </GlassPanel>
      </Link>

      <button
        type="button"
        onClick={() => {
          enterDemo();
          navigate({ to: "/app", search: { demo: true } });
        }}
        className="block w-full text-left"
      >
        <GlassPanel className="flex items-center gap-3 p-4">
          <PlayCircle className="h-5 w-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Explore the demo</span>
            <span className="block text-[13px] text-muted-foreground">
              A sample pizza shop with example data.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </GlassPanel>
      </button>
    </div>
  );
}
