import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — TapLocal" },
      { name: "description", content: "Sign in to your TapLocal business portal." },
      { property: "og:title", content: "Sign in — TapLocal" },
      { property: "og:description", content: "Sign in to your TapLocal business portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setState(error ? "error" : "sent");
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
  }

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 py-12">
        <Link to="/" className="text-[13px] text-muted-foreground">
          ← TapLocal
        </Link>
        <h1 className="mt-5 font-display text-[24px] font-bold tracking-tight">Sign in</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
          Use the email address you set up your plaques with.
        </p>

        <GlassPanel className="mt-5 p-4">
          <button
            type="button"
            onClick={google}
            className="w-full rounded-xl border border-border bg-foreground/10 px-4 py-3 text-[14px] font-semibold"
          >
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={sendLink} className="space-y-2.5">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              className="w-full rounded-xl border border-border bg-foreground/[0.06] px-3.5 py-3 text-[14px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full rounded-xl bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>

          {state === "sent" ? (
            <p className="mt-3 text-[13px] text-accent">Check your inbox for the link.</p>
          ) : null}
          {state === "error" ? (
            <p className="mt-3 text-[13px] text-destructive">
              That didn't send. Check the address and try again.
            </p>
          ) : null}
        </GlassPanel>

        <p className="mt-5 text-[13px] text-muted-foreground">
          Just received a plaque?{" "}
          <Link
            to="/activate/$token"
            params={{ token: "demo-activation-token" }}
            className="font-semibold text-primary"
          >
            Activate it here
          </Link>
        </p>
      </div>
    </Field>
  );
}
