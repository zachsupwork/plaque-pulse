import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MapPin, Mic, Search, Sparkles, Star } from "lucide-react";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { NfcReadyCheck } from "@/components/taplocal/NfcReadyCheck";
import { claimActivation, completeActivation, lookupActivation } from "@/lib/activation.functions";
import { useIdentity } from "@/hooks/useAuthSession";
import { parseActivationCommand } from "@/lib/activation-command.functions";
import { getBusinessDetails, searchBusinesses } from "@/lib/business-discovery.functions";

export const Route = createFileRoute("/activate/$token")({
  head: () => ({
    meta: [
      { title: "Set up your plaque — TapLocal" },
      { name: "description", content: "Set up your plaque in about a minute. No app, no card reader." },
      { property: "og:title", content: "Set up your plaque — TapLocal" },
      { property: "og:description", content: "Set up your plaque in about a minute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivatePage,
});

type Place = {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  mapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
};

/** The customer-facing version of the admin destination list. */
const DESTINATIONS = [
  { value: "google_review", label: "Google Reviews", goal: "google_reviews", needsUrl: false },
  { value: "instagram", label: "Instagram", goal: "instagram_followers", needsUrl: true },
  { value: "menu", label: "Menu", goal: "orders", needsUrl: true },
  { value: "website", label: "Website", goal: "website_visits", needsUrl: true },
  { value: "booking", label: "Booking", goal: "bookings", needsUrl: true },
  { value: "custom", label: "Other", goal: "leads", needsUrl: true },
] as const;

type DestinationValue = (typeof DESTINATIONS)[number]["value"];

const PLACEMENTS = [
  { value: "front_counter", label: "Front counter" },
  { value: "table", label: "Table" },
  { value: "entrance", label: "Entrance" },
  { value: "pickup", label: "Pickup" },
  { value: "checkout", label: "Checkout" },
  { value: "other", label: "Other" },
];

type Step = "start" | "search" | "tell" | "business" | "account" | "destination" | "placement" | "review" | "done";

const FLOW: Step[] = ["business", "account", "destination", "placement", "review"];

type Draft = {
  place: Place | null;
  manualName: string;
  destination: DestinationValue;
  destinationUrl: string;
  placement: string;
  plaqueName: string;
  step: Step;
};

function newSessionToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function draftKey(token: string) {
  return `taplocal-setup-${token}`;
}

function ActivatePage() {
  const { token } = useParams({ from: "/activate/$token" });
  const lookup = useServerFn(lookupActivation);
  const search = useServerFn(searchBusinesses);
  const details = useServerFn(getBusinessDetails);
  const complete = useServerFn(completeActivation);
  const claim = useServerFn(claimActivation);
  const parseCommand = useServerFn(parseActivationCommand);
  const identity = useIdentity();
  const signedIn = Boolean(identity.data?.signedIn);

  const sessionToken = useRef(newSessionToken());
  const [step, setStep] = useState<Step>("start");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [manualName, setManualName] = useState("");
  const [destination, setDestination] = useState<DestinationValue>("google_review");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placement, setPlacement] = useState("front_counter");
  const [plaqueName, setPlaqueName] = useState("");
  const [sentence, setSentence] = useState("");
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const plaque = useQuery({
    queryKey: ["activation", token],
    queryFn: () => lookup({ data: { token } }),
    retry: false,
  });

  // Coming back from the sign-in email must not throw away what they already chose.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey(token));
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        setPlace(d.place ?? null);
        setManualName(d.manualName ?? "");
        setDestination(d.destination ?? "google_review");
        setDestinationUrl(d.destinationUrl ?? "");
        setPlacement(d.placement ?? "front_counter");
        setPlaqueName(d.plaqueName ?? "");
        if (d.step && d.step !== "done") setStep(d.step);
      }
    } catch {
      /* a broken draft simply starts the flow over */
    }
    setRestored(true);
  }, [token]);

  useEffect(() => {
    if (!restored) return;
    const draft: Draft = { place, manualName, destination, destinationUrl, placement, plaqueName, step };
    try {
      sessionStorage.setItem(draftKey(token), JSON.stringify(draft));
    } catch {
      /* private mode — the flow still works, it just can't be resumed */
    }
  }, [restored, token, place, manualName, destination, destinationUrl, placement, plaqueName, step]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const results = useQuery({
    queryKey: ["business-search", debounced],
    enabled: step === "search" && debounced.length >= 3,
    queryFn: () => search({ data: { query: debounced, sessionToken: sessionToken.current } }),
    retry: false,
  });

  const pick = useMutation({
    mutationFn: (placeId: string) => details({ data: { placeId, sessionToken: sessionToken.current } }),
    onSuccess: (data) => {
      if (!data.place) {
        setNotice("We couldn't load that listing. Try another one.");
        return;
      }
      setPlace(data.place as Place);
      setPlaqueName((name) => name || `${data.place!.name} plaque`);
      setStep("business");
    },
  });

  const interpret = useMutation({
    mutationFn: () => parseCommand({ data: { text: sentence } }),
    onSuccess: (data) => {
      const parsed = data.parsed;
      if (!parsed) {
        setNotice("Let's find your business by name instead.");
        setStep("search");
        return;
      }
      const matched = DESTINATIONS.find((d) => d.goal === parsed.goal_type);
      if (matched) setDestination(matched.value);
      if (parsed.placement_type && PLACEMENTS.some((p) => p.value === parsed.placement_type)) {
        setPlacement(parsed.placement_type);
      }
      if (parsed.plaque_name) setPlaqueName(parsed.plaque_name);
      const q = [parsed.business_query, parsed.location_hint].filter(Boolean).join(" ");
      setQuery(q || sentence);
      setStep("search");
    },
    onError: () => setStep("search"),
  });

  const goLive = useMutation({
    mutationFn: async () => {
      const chosen = DESTINATIONS.find((d) => d.value === destination)!;
      const result = await complete({
        data: {
          token,
          business: place
            ? place
            : {
                placeId: null,
                name: manualName || query || "My business",
                formattedAddress: null,
                city: null,
                region: null,
                country: null,
                latitude: null,
                longitude: null,
                phone: null,
                website: destinationUrl || null,
                mapsUri: null,
                rating: null,
                reviewCount: null,
                businessStatus: null,
                primaryType: null,
              },
          goalType: chosen.goal,
          destinationType: chosen.value,
          destinationUrl: destinationUrl || null,
          placementType: placement,
          plaqueName: plaqueName || "My plaque",
        },
      });
      if (result.ok && signedIn) {
        await claim({ data: { token } });
      }
      return result;
    },
    onSuccess: (data) => {
      if (!data.ok) {
        setNotice(
          data.error === "already_assigned"
            ? "This plaque is already set up for another business. Contact TapLocal and we'll move it over safely."
            : "We couldn't finish this. Check the code on your card and try again.",
        );
        return;
      }
      try {
        sessionStorage.removeItem(draftKey(token));
      } catch {
        /* nothing to clean up */
      }
      setStep("done");
    },
    onError: () => setNotice("Something went wrong. Try again."),
  });

  function startVoice() {
    const Ctor =
      (window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!Ctor) {
      setNotice("Speaking isn't supported in this browser — typing works just as well.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-CA";
    recognition.interimResults = false;
    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      setSentence(event.results[0]?.[0]?.transcript ?? "");
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  if (plaque.isLoading) {
    return (
      <Field>
        <p className="px-5 pt-20 text-center text-[13px] text-muted-foreground">Checking your plaque…</p>
      </Field>
    );
  }

  if (plaque.data?.rateLimited) {
    return <Message title="Too many tries" body="Wait a few minutes and enter the code from your card again." />;
  }

  if (!plaque.data?.plaque) {
    return (
      <Message
        title="This link isn't valid"
        body="Setup codes only work once. If your plaque is already set up, open your portal instead."
      />
    );
  }

  const activePlaque = plaque.data.plaque;
  const preconfigured = plaque.data.preconfigured;
  const searchResults = results.data?.results ?? [];
  const chosen = DESTINATIONS.find((d) => d.value === destination)!;
  const businessName = place?.name ?? manualName ?? "";
  const destinationReady = !chosen.needsUrl ? Boolean(place?.placeId) || Boolean(destinationUrl) : Boolean(destinationUrl);
  const stepIndex = FLOW.indexOf(step);

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 pt-8 pb-20">
        <Link to="/" aria-label="TapLocal home" className="mb-5 inline-block">
          <BrandLockup />
        </Link>

        <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
          Plaque {activePlaque.plaque_code}
        </p>

        {stepIndex >= 0 ? (
          <div className="mt-3 flex items-center gap-1.5" aria-hidden>
            {FLOW.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-foreground/10"}`}
              />
            ))}
          </div>
        ) : null}

        {step === "start" && preconfigured ? (
          <FoundPlaque token={token} plaqueCode={activePlaque.plaque_code} info={preconfigured} />
        ) : null}

        {step === "start" && !preconfigured ? (
          <>
            <h1 className="mt-2 font-display text-[27px] leading-tight font-bold tracking-tight text-balance">
              Let's set up your plaque.
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
              Find your business, pick where a tap should send people, then go live. About a minute.
            </p>

            <div className="mt-5 space-y-3">
              <BigChoice
                icon={<Search className="h-5 w-5" />}
                title="Find my business"
                body="We'll pull your details from your public Google listing."
                onClick={() => setStep("search")}
              />
              <BigChoice
                icon={<Sparkles className="h-5 w-5" />}
                title="Just tell TapLocal"
                body="Say or type it in one sentence and we'll set it up."
                onClick={() => setStep("tell")}
              />
            </div>

            <div className="mt-4">
              <NfcReadyCheck expectedSlug={activePlaque.public_slug} />
            </div>
          </>
        ) : null}

        {step === "tell" ? (
          <GlassPanel sheen className="mt-4 space-y-3 p-5">
            <h2 className="font-display text-[20px] font-bold tracking-tight text-balance">
              Tell us in one sentence
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
              For example: "Pi Co on Metcalfe, I want more Google reviews, it's going on the front counter."
            </p>
            <textarea
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startVoice}
                className={`grid h-11 w-11 place-items-center rounded-xl border ${
                  listening ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                }`}
                aria-label="Speak instead of typing"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={sentence.trim().length < 4 || interpret.isPending}
                onClick={() => interpret.mutate()}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
              >
                {interpret.isPending ? "Reading that…" : "Continue"}
              </button>
            </div>
            <BackLink onClick={() => setStep("start")} />
          </GlassPanel>
        ) : null}

        {step === "search" ? (
          <GlassPanel sheen className="mt-4 space-y-3 p-5">
            <StepLabel>Step 1 of 5 · Your business</StepLabel>
            <h2 className="font-display text-[20px] font-bold tracking-tight">What's your business called?</h2>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Joe's Pizza, Ottawa"
              className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
            />

            {results.isFetching ? (
              <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </p>
            ) : null}

            <div className="space-y-2">
              {searchResults.map((r) => (
                <button
                  key={r.placeId}
                  type="button"
                  disabled={pick.isPending}
                  onClick={() => pick.mutate(r.placeId)}
                  className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-left"
                >
                  <p className="text-[14px] font-semibold">{r.name}</p>
                  <p className="text-[12px] text-muted-foreground">{r.address}</p>
                </button>
              ))}
            </div>

            {debounced.length >= 3 && !results.isFetching && searchResults.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setManualName(query);
                  setStep("business");
                }}
                className="text-[12px] font-semibold text-primary underline underline-offset-4"
              >
                Can't find it? Set it up by hand
              </button>
            ) : null}

            <BackLink onClick={() => setStep("start")} />
          </GlassPanel>
        ) : null}

        {step === "business" ? (
          <GlassPanel sheen className="mt-4 space-y-4 p-5">
            <StepLabel>Step 1 of 5 · Confirm business</StepLabel>
            <h2 className="font-display text-[20px] leading-tight font-bold tracking-tight text-balance">
              {place ? "Is this you?" : "Tell us about your business"}
            </h2>
            {place ? (
              <div className="rounded-xl border border-border bg-foreground/5 p-3.5">
                <p className="text-[15px] font-semibold">{place.name}</p>
                {place.formattedAddress ? (
                  <p className="mt-0.5 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {place.formattedAddress}
                  </p>
                ) : null}
                {typeof place.rating === "number" ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Star className="h-3.5 w-3.5 text-accent" />
                    {place.rating} · {place.reviewCount ?? 0} reviews today
                  </p>
                ) : null}
              </div>
            ) : (
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Your business name"
                className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
              />
            )}

            <button
              type="button"
              disabled={!place && manualName.trim().length < 2}
              onClick={() => setStep("account")}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Yes, continue
            </button>
            <BackLink onClick={() => setStep("search")} />
          </GlassPanel>
        ) : null}

        {step === "account" ? (
          <GlassPanel sheen className="mt-4 space-y-4 p-5">
            <StepLabel>Step 2 of 5 · Your account</StepLabel>
            <h2 className="font-display text-[20px] font-bold tracking-tight text-balance">
              {signedIn ? "You're signed in." : "Sign in or create your account"}
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {signedIn
                ? "This plaque will be connected to your account when you finish."
                : "We'll email you a link. Come back here and your setup will still be waiting."}
            </p>
            {signedIn ? (
              <button
                type="button"
                onClick={() => setStep("destination")}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground"
              >
                Continue
              </button>
            ) : (
              <>
                <Link
                  to="/auth"
                  search={{ returnTo: `/activate/${token}` }}
                  className="block w-full rounded-xl bg-primary px-4 py-3.5 text-center text-[14px] font-bold text-primary-foreground"
                >
                  Sign in / create account
                </Link>
                <button
                  type="button"
                  onClick={() => setStep("destination")}
                  className="w-full text-[12px] font-semibold text-muted-foreground underline underline-offset-4"
                >
                  I'll do this at the end
                </button>
              </>
            )}
            <BackLink onClick={() => setStep("business")} />
          </GlassPanel>
        ) : null}

        {step === "destination" ? (
          <GlassPanel sheen className="mt-4 space-y-4 p-5">
            <StepLabel>Step 3 of 5 · Destination</StepLabel>
            <h2 className="font-display text-[20px] font-bold tracking-tight text-balance">
              Where should a tap send people?
            </h2>
            <Chips
              options={DESTINATIONS.map((d) => ({ value: d.value, label: d.label }))}
              value={destination}
              onChange={(v) => setDestination(v as DestinationValue)}
            />

            {chosen.value === "google_review" && place?.placeId ? (
              <p className="text-[12px] text-muted-foreground text-pretty">
                Every tap opens your Google review box, ready to write.
              </p>
            ) : (
              <div>
                <input
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  placeholder="https://… where a tap should send people"
                  className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
                />
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  You can change this any time from your portal.
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={!destinationReady}
              onClick={() => setStep("placement")}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Continue
            </button>
            <BackLink onClick={() => setStep("account")} />
          </GlassPanel>
        ) : null}

        {step === "placement" ? (
          <GlassPanel sheen className="mt-4 space-y-4 p-5">
            <StepLabel>Step 4 of 5 · Placement</StepLabel>
            <h2 className="font-display text-[20px] font-bold tracking-tight text-balance">Where will it sit?</h2>
            <Chips options={PLACEMENTS} value={placement} onChange={setPlacement} />
            <input
              value={plaqueName}
              onChange={(e) => setPlaqueName(e.target.value)}
              placeholder="Name it, e.g. Counter plaque"
              className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={() => setStep("review")}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground"
            >
              Review setup
            </button>
            <BackLink onClick={() => setStep("destination")} />
          </GlassPanel>
        ) : null}

        {step === "review" ? (
          <GlassPanel sheen className="mt-4 space-y-4 p-5">
            <StepLabel>Step 5 of 5 · Review</StepLabel>
            <h2 className="font-display text-[20px] font-bold tracking-tight text-balance">Check this over</h2>
            <div className="divide-y divide-border rounded-xl border border-border bg-foreground/5">
              <DetailRow label="Business" value={businessName || "Unavailable"} />
              {place?.formattedAddress ? <DetailRow label="Address" value={place.formattedAddress} /> : null}
              <DetailRow label="Plaque" value={plaqueName ? `${plaqueName} · ${activePlaque.plaque_code}` : activePlaque.plaque_code} />
              <DetailRow label="Placement" value={PLACEMENTS.find((p) => p.value === placement)?.label ?? placement} />
              <DetailRow label="Destination" value={chosen.label} />
              {destinationUrl ? <DetailRow label="Opens" value={destinationUrl} /> : null}
              <DetailRow label="Account" value={signedIn ? "Signed in" : "Sign in after setup"} />
            </div>
            <button
              type="button"
              disabled={goLive.isPending}
              onClick={() => goLive.mutate()}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {goLive.isPending ? "Setting up…" : "Set up my plaque"}
            </button>
            <BackLink onClick={() => setStep("placement")} />
          </GlassPanel>
        ) : null}

        {step === "done" ? (
          <GlassPanel sheen className="mt-4 p-5 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/20 text-accent">
              <Check className="h-6 w-6" />
            </span>
            <h2 className="mt-3 font-display text-[22px] font-bold tracking-tight">Your plaque is live</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
              Put it on the {(PLACEMENTS.find((p) => p.value === placement)?.label ?? "counter").toLowerCase()} and
              tap it with your phone to try it.
            </p>
            {signedIn ? (
              <Link
                to="/app"
                className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground"
              >
                Open my dashboard
              </Link>
            ) : (
              <Link
                to="/auth"
                search={{ returnTo: `/activate/${token}` }}
                className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground"
              >
                Create my account
              </Link>
            )}
          </GlassPanel>
        ) : null}

        {notice ? <p className="mt-3 text-[12px] text-muted-foreground">{notice}</p> : null}
      </div>
    </Field>
  );
}

/** TapLocal already set this plaque up. The owner only has to claim it. */
function FoundPlaque({
  token,
  plaqueCode,
  info,
}: {
  token: string;
  plaqueCode: string;
  info: {
    businessName: string;
    address: string | null;
    placementType: string | null;
    plaqueName: string | null;
    destinationType: string | null;
    destinationUrl: string | null;
  };
}) {
  const identity = useIdentity();
  const claim = useServerFn(claimActivation);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(identity.data?.signedIn);

  const run = useMutation({
    mutationFn: () => claim({ data: { token } }),
    onSuccess: (data) => {
      if (data.ok) window.location.replace("/app");
      else setError("We couldn't connect this plaque to your account. Contact TapLocal and we'll sort it out.");
    },
    onError: () => setError("Something went wrong. Try again."),
  });

  return (
    <GlassPanel sheen className="mt-4 space-y-4 p-5">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.12em] text-accent uppercase">We found your plaque</p>
        <h1 className="mt-2 font-display text-[24px] leading-tight font-bold tracking-tight text-balance">
          {info.businessName}
        </h1>
        {info.address ? <p className="mt-1 text-[13px] text-muted-foreground">{info.address}</p> : null}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-foreground/5">
        <DetailRow label="Business" value={info.businessName} />
        <DetailRow label="Plaque" value={info.plaqueName ? `${info.plaqueName} · ${plaqueCode}` : plaqueCode} />
        <DetailRow
          label="Placement"
          value={
            info.placementType
              ? (PLACEMENTS.find((p) => p.value === info.placementType)?.label ?? info.placementType)
              : "Unavailable"
          }
        />
        <DetailRow label="Destination" value={info.destinationUrl ?? info.destinationType ?? "Unavailable"} />
      </div>

      {signedIn ? (
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => run.mutate()}
          className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
        >
          {run.isPending ? "Connecting…" : "Claim & continue"}
        </button>
      ) : (
        <Link
          to="/auth"
          search={{ returnTo: `/activate/${token}` }}
          className="block w-full rounded-xl bg-primary px-4 py-3.5 text-center text-[14px] font-bold text-primary-foreground"
        >
          Claim &amp; continue
        </Link>
      )}
      <p className="text-[12px] text-muted-foreground text-pretty">
        Sign in or create your account to take ownership. You can change the destination and placement any time
        from your portal.
      </p>
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </GlassPanel>
  );
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{children}</p>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold">{value}</span>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Field>
      <div className="mx-auto max-w-md px-5 pt-24 text-center">
        <h1 className="font-display text-[24px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">{body}</p>
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

function BigChoice({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-foreground/5 p-4 text-left"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground text-pretty">
          {body}
        </span>
      </span>
    </button>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
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

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-semibold text-muted-foreground underline underline-offset-4"
    >
      Back
    </button>
  );
}
