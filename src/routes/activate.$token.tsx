import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { completeActivation, lookupActivation } from "@/lib/activation.functions";

export const Route = createFileRoute("/activate/$token")({
  head: () => ({
    meta: [
      { title: "Activate your SmartPlaque — TapLocal" },
      { name: "description", content: "Set up your plaque in about a minute. No app, no card reader." },
      { property: "og:title", content: "Activate your SmartPlaque — TapLocal" },
      { property: "og:description", content: "Set up your plaque in about a minute." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivatePage,
});

const INDUSTRIES = ["restaurant", "cafe", "salon", "retail", "gym", "clinic", "trades", "other"];
const GOALS = [
  { value: "google_reviews", label: "More Google reviews" },
  { value: "instagram_followers", label: "More Instagram followers" },
  { value: "bookings", label: "More bookings" },
  { value: "leads", label: "More enquiries" },
  { value: "orders", label: "More orders" },
];
const DESTINATIONS = [
  { value: "google_review", label: "My Google review page" },
  { value: "instagram", label: "My Instagram" },
  { value: "menu", label: "My menu" },
  { value: "booking", label: "My booking page" },
  { value: "coupon", label: "A coupon" },
  { value: "website", label: "My website" },
] as const;
const PLACEMENTS = [
  { value: "front_counter", label: "Front counter" },
  { value: "table", label: "On the tables" },
  { value: "entrance", label: "By the entrance" },
  { value: "exit", label: "By the exit" },
  { value: "window", label: "In the window" },
  { value: "menu", label: "With the menu" },
];

const STEPS = ["Your business", "Your goal", "Where it sends people", "Where it sits", "Name it", "Done"];

function ActivatePage() {
  const { token } = useParams({ from: "/activate/$token" });
  const lookup = useServerFn(lookupActivation);
  const complete = useServerFn(completeActivation);

  const plaque = useQuery({
    queryKey: ["activation", token],
    queryFn: () => lookup({ data: { token } }),
    retry: false,
  });

  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("restaurant");
  const [goalType, setGoalType] = useState("google_reviews");
  const [destinationType, setDestinationType] =
    useState<(typeof DESTINATIONS)[number]["value"]>("google_review");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placementType, setPlacementType] = useState("front_counter");
  const [plaqueName, setPlaqueName] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      complete({
        data: {
          token,
          businessName,
          industry,
          goalType,
          destinationType,
          destinationUrl,
          placementType,
          plaqueName: plaqueName || "My plaque",
        },
      }),
    onSuccess: () => setStep(5),
  });

  if (plaque.isLoading) {
    return (
      <Field>
        <p className="px-5 pt-20 text-center text-[13px] text-muted-foreground">Checking your plaque…</p>
      </Field>
    );
  }

  if (!plaque.data?.plaque) {
    return (
      <Field>
        <div className="mx-auto max-w-md px-5 pt-24 text-center">
          <h1 className="font-display text-[24px] font-bold tracking-tight">This link isn't valid</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
            Activation links only work once. If your plaque is already set up, open your portal instead.
          </p>
          <Link
            to="/app"
            className="mt-5 inline-block rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground"
          >
            Open portal
          </Link>
        </div>
      </Field>
    );
  }

  const canAdvance =
    (step === 0 && businessName.trim().length > 1) ||
    step === 1 ||
    (step === 2 && /^https?:\/\/.+/.test(destinationUrl)) ||
    step === 3 ||
    step === 4;

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 pt-8 pb-16">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-foreground/10"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Step {Math.min(step + 1, 5)} of 5 · {plaque.data.plaque.plaque_code}
        </p>

        <GlassPanel sheen className="mt-4 p-5">
          {step === 0 ? (
            <Step title="What's your business called?">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Joe's Pizza"
                className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
              />
              <Choices
                options={INDUSTRIES.map((v) => ({ value: v, label: pretty(v) }))}
                value={industry}
                onChange={setIndustry}
              />
            </Step>
          ) : null}

          {step === 1 ? (
            <Step title="What do you want more of?">
              <Choices options={GOALS} value={goalType} onChange={setGoalType} />
            </Step>
          ) : null}

          {step === 2 ? (
            <Step title="Where should a tap send people?">
              <Choices
                options={DESTINATIONS.map((d) => ({ value: d.value, label: d.label }))}
                value={destinationType}
                onChange={(v) => setDestinationType(v as (typeof DESTINATIONS)[number]["value"])}
              />
              <input
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
              />
              <p className="text-[12px] text-muted-foreground">
                Paste the link you want customers to land on. You can change this any time.
              </p>
            </Step>
          ) : null}

          {step === 3 ? (
            <Step title="Where will the plaque sit?">
              <Choices options={PLACEMENTS} value={placementType} onChange={setPlacementType} />
            </Step>
          ) : null}

          {step === 4 ? (
            <Step title="Give it a name you'll recognise">
              <input
                value={plaqueName}
                onChange={(e) => setPlaqueName(e.target.value)}
                placeholder="Counter plaque"
                className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
              />
              <div className="rounded-xl border border-border bg-foreground/5 p-3.5 text-[13px] leading-relaxed">
                <p className="font-semibold">Ready to go live</p>
                <p className="mt-1 text-muted-foreground text-pretty">
                  {businessName || "Your business"} · every tap goes to{" "}
                  {DESTINATIONS.find((d) => d.value === destinationType)?.label.toLowerCase()} ·{" "}
                  {PLACEMENTS.find((p) => p.value === placementType)?.label.toLowerCase()}
                </p>
              </div>
            </Step>
          ) : null}

          {step === 5 ? (
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/20 text-accent">
                <Check className="h-6 w-6" />
              </span>
              <h2 className="mt-3 font-display text-[22px] font-bold tracking-tight">Your plaque is live</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                Put it where you said and tap it with your phone to test. Everything that happens next shows
                up in your portal.
              </p>
              <Link
                to="/app"
                className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground"
              >
                Open my portal
              </Link>
            </div>
          ) : null}

          {step < 5 ? (
            <div className="mt-5 flex gap-2">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-xl border border-border px-4 py-3 text-[13px] font-semibold text-muted-foreground"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                disabled={!canAdvance || submit.isPending}
                onClick={() => (step === 4 ? submit.mutate() : setStep((s) => s + 1))}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
              >
                {step === 4 ? (submit.isPending ? "Going live…" : "Go live") : "Continue"}
              </button>
            </div>
          ) : null}
        </GlassPanel>
      </div>
    </Field>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h1 className="font-display text-[21px] leading-tight font-bold tracking-tight text-balance">{title}</h1>
      {children}
    </div>
  );
}

function Choices({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3.5 py-2 text-[13px] font-medium ${
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-foreground/5 text-muted-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
