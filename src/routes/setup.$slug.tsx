import { useState } from "react";
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { lookupPlaqueBySlug } from "@/lib/activation.functions";

export const Route = createFileRoute("/setup/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    source: search["source"] === "qr" ? ("qr" as const) : ("nfc" as const),
  }),
  head: () => ({
    meta: [
      { title: "Set up your plaque — TapLocal" },
      { name: "description", content: "Your plaque works. Set it up in about a minute." },
      { property: "og:title", content: "Set up your plaque — TapLocal" },
      { property: "og:description", content: "Your plaque works. Set it up in about a minute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { slug } = useParams({ from: "/setup/$slug" });
  const { source } = useSearch({ from: "/setup/$slug" });
  const navigate = useNavigate();
  const lookup = useServerFn(lookupPlaqueBySlug);
  const [code, setCode] = useState("");

  const plaque = useQuery({
    queryKey: ["plaque-slug", slug],
    queryFn: () => lookup({ data: { slug } }),
    retry: false,
  });

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 pt-10 pb-16">
        <div className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-accent uppercase">
          <Check className="h-4 w-4" />
          {source === "qr" ? "QR detected" : "NFC detected"}
        </div>

        <h1 className="mt-3 font-display text-[26px] leading-tight font-bold tracking-tight text-balance">
          Your plaque works.
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
          {plaque.data?.found
            ? `Plaque ${plaque.data.plaque?.plaque_code} isn't set up yet. It takes about a minute.`
            : "Let's get it pointed somewhere useful."}
        </p>

        {plaque.data?.plaque?.configured ? (
          <GlassPanel className="mt-5 p-5 text-[13px] leading-relaxed text-muted-foreground">
            This plaque is already set up. If it's yours, open your portal to change where it sends people.
          </GlassPanel>
        ) : (
          <GlassPanel sheen className="mt-5 space-y-3 p-5">
            <h2 className="font-display text-[18px] font-bold tracking-tight">
              Enter the code on your card
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
              It's printed on the card that came with your plaque. This is what proves the plaque is yours.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="e.g. 8FQ2-KD91"
              autoCapitalize="characters"
              className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] tracking-wide outline-none focus:border-primary/60"
            />
            <button
              type="button"
              disabled={code.length < 6}
              onClick={() => navigate({ to: "/activate/$token", params: { token: code } })}
              className="w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Start setup
            </button>
          </GlassPanel>
        )}
      </div>
    </Field>
  );
}
