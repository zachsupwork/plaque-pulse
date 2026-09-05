import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } => {
    const raw = typeof search["returnTo"] === "string" ? (search["returnTo"] as string) : "";
    // Only same-site paths are ever honoured.
    return { returnTo: /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : "/app" };
  },
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

/** Reads the Supabase error that arrives in the URL fragment after a bad link. */
function useLinkError() {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const code = params.get("error_code") ?? "";
    const err = params.get("error") ?? "";
    if (code || err) {
      setExpired(true);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
  return { expired, dismiss: () => setExpired(false) };
}

function AuthPage() {
  const returnTo = Route.useSearch().returnTo ?? "/app";
  const isAdminContext = returnTo.startsWith("/admin");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const { expired, dismiss } = useLinkError();

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${returnTo}` },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 py-12">
        <Link to="/" className="text-[13px] text-muted-foreground">
          ← Back to TapLocal
        </Link>

        {expired ? (
          <GlassPanel className="mt-5 p-5">
            <h1 className="font-display text-[20px] font-bold tracking-tight">This sign-in link expired.</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Sign-in links only work once, and only for a short time.
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold tracking-wide text-primary-foreground uppercase"
            >
              Send a new link
            </button>
            <Link
              to="/"
              className="mt-2 block rounded-xl border border-border px-4 py-3 text-center text-[13px] font-bold tracking-wide uppercase"
            >
              Back to TapLocal
            </Link>
          </GlassPanel>

        ) : (
          <>
            {isAdminContext ? (
              <p className="mt-5 text-[12px] font-bold tracking-[0.12em] text-primary uppercase">TapLocal Admin</p>
            ) : null}
            <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight">
              {isAdminContext ? "Sign in to continue" : "Sign in to TapLocal"}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
              {isAdminContext
                ? "Use your authorized TapLocal administrator account."
                : "Manage your business and SmartPlaques."}
            </p>

            <GlassPanel className="mt-5 p-4">
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

              <p className="mt-4 text-center text-[12px] text-muted-foreground">Google sign-in coming soon</p>
            </GlassPanel>
          </>
        )}

        <p className="mt-5 text-[13px] text-muted-foreground">
          Just received a plaque?{" "}
          <Link
            to="/activate"
            className="font-semibold text-primary"
          >
            Activate it here
          </Link>
        </p>
      </div>
    </Field>
  );
}
