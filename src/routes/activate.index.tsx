import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";

export const Route = createFileRoute("/activate/")({
  head: () => ({
    meta: [
      { title: "Activate a plaque — TapLocal" },
      {
        name: "description",
        content: "Enter the activation code printed on your TapLocal card to set up your SmartPlaque.",
      },
      { property: "og:title", content: "Activate a plaque — TapLocal" },
      { property: "og:description", content: "Enter your activation code to set up your SmartPlaque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivateEntry,
});

function ActivateEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(event: React.FormEvent) {
    event.preventDefault();
    const clean = code.trim().replace(/\s+/g, "");
    if (clean.length < 6) {
      setError("Enter the full code printed on your card.");
      return;
    }
    setError(null);
    navigate({ to: "/activate/$token", params: { token: clean } });
  }

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 pt-8 pb-20">
        <Link to="/" aria-label="TapLocal home" className="mb-5 inline-block">
          <BrandLockup />
        </Link>

        <h1 className="font-display text-[27px] leading-tight font-bold tracking-tight text-balance">
          Activate your plaque.
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
          Enter the activation code on the card that came with your plaque. If you tapped or scanned your
          plaque, you're already on the right page — just follow the link it opened.
        </p>

        <GlassPanel className="mt-5 space-y-3 p-5">
          <form onSubmit={go} className="space-y-3">
            <label htmlFor="activation-code" className="block text-[12px] font-semibold text-muted-foreground">
              Activation code
            </label>
            <input
              id="activation-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              className="w-full rounded-xl border border-border bg-card px-3 py-3 text-center font-mono text-[18px] font-bold tracking-[0.2em]"
            />
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground"
            >
              Continue
            </button>
          </form>
        </GlassPanel>

        <p className="mt-4 text-[13px] text-muted-foreground">
          Already set up?{" "}
          <Link to="/app" className="font-semibold text-accent">
            Open your portal
          </Link>
          .
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Want to see how it works first?{" "}
          <Link to="/demo" className="font-semibold text-accent">
            Try the demo
          </Link>
          .
        </p>
      </div>
    </Field>
  );
}
