import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MapPin, Mic, Search, Sparkles, Star } from "lucide-react";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { NfcReadyCheck } from "@/components/taplocal/NfcReadyCheck";
import { completeActivation, lookupActivation } from "@/lib/activation.functions";
import { parseActivationCommand } from "@/lib/activation-command.functions";
import { getBusinessDetails, searchBusinesses } from "@/lib/business-discovery.functions";

export const Route = createFileRoute("/activate/$token")({
  head: () => ({
    meta: [
      { title: "Activate your SmartPlaque — TapLocal" },
      { name: "description", content: "Set up your plaque in about a minute. No app, no card reader." },
      { property: "og:title", content: "Activate your SmartPlaque — TapLocal" },
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

const GOALS = [
  { value: "google_reviews", label: "More Google reviews", destination: "google_review" },
  { value: "instagram_followers", label: "More Instagram followers", destination: "instagram" },
  { value: "bookings", label: "More bookings", destination: "booking" },
  { value: "leads", label: "More enquiries", destination: "quote" },
  { value: "orders", label: "More orders", destination: "menu" },
  { value: "website_visits", label: "More website visits", destination: "website" },
] as const;

const PLACEMENTS = [
  { value: "front_counter", label: "Front counter" },
  { value: "checkout", label: "At the checkout" },
  { value: "table", label: "On the tables" },
  { value: "reception", label: "Reception desk" },
  { value: "entrance", label: "By the entrance" },
  { value: "exit", label: "By the exit" },
  { value: "waiting_area", label: "Waiting area" },
];

function newSessionToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ActivatePage() {
  const { token } = useParams({ from: "/activate/$token" });
  const lookup = useServerFn(lookupActivation);
  const search = useServerFn(searchBusinesses);
  const details = useServerFn(getBusinessDetails);
  const complete = useServerFn(completeActivation);
  const parseCommand = useServerFn(parseActivationCommand);

  const sessionToken = useRef(newSessionToken());
  const [mode, setMode] = useState<"start" | "search" | "tell" | "confirm" | "done">("start");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [goal, setGoal] = useState<(typeof GOALS)[number]["value"]>("google_reviews");
  const [placement, setPlacement] = useState("front_counter");
  const [plaqueName, setPlaqueName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [sentence, setSentence] = useState("");
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plaque = useQuery({
    queryKey: ["activation", token],
    queryFn: () => lookup({ data: { token } }),
    retry: false,
  });

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const results = useQuery({
    queryKey: ["business-search", debounced],
    enabled: mode === "search" && debounced.length >= 3,
    queryFn: () => search({ data: { query: debounced, sessionToken: sessionToken.current } }),
    retry: false,
  });

  const pick = useMutation({
    mutationFn: (placeId: string) =>
      details({ data: { placeId, sessionToken: sessionToken.current } }),
    onSuccess: (data) => {
      if (!data.place) {
        setNotice("We couldn't load that listing. Try another one.");
        return;
      }
      setPlace(data.place as Place);
      setPlaqueName((name) => name || `${data.place!.name} plaque`);
      setMode("confirm");
    },
  });

  const interpret = useMutation({
    mutationFn: () => parseCommand({ data: { text: sentence } }),
    onSuccess: (data) => {
      const parsed = data.parsed;
      if (!parsed) {
        setNotice("Let's find your business by name instead.");
        setMode("search");
        return;
      }
      const matchedGoal = GOALS.find((g) => g.value === parsed.goal_type);
      if (matchedGoal) setGoal(matchedGoal.value);
      if (parsed.placement_type && PLACEMENTS.some((p) => p.value === parsed.placement_type)) {
        setPlacement(parsed.placement_type);
      }
      if (parsed.plaque_name) setPlaqueName(parsed.plaque_name);
      const q = [parsed.business_query, parsed.location_hint].filter(Boolean).join(" ");
      setQuery(q || sentence);
      setMode("search");
    },
    onError: () => setMode("search"),
  });

  const goLive = useMutation({
    mutationFn: () => {
      const destinationType = GOALS.find((g) => g.value === goal)!.destination;
      return complete({
        data: {
          token,
          business: place
            ? place
            : {
                placeId: null,
                name: query || "My business",
                formattedAddress: null,
                city: null,
                region: null,
                country: null,
                latitude: null,
                longitude: null,
                phone: null,
                website: manualUrl || null,
                mapsUri: null,
                rating: null,
                reviewCount: null,
                businessStatus: null,
                primaryType: null,
              },
          goalType: goal,
          destinationType,
          destinationUrl: manualUrl || null,
          placementType: placement,
          plaqueName: plaqueName || "My plaque",
        },
      });
    },
    onSuccess: (data) => {
      if (data.ok) setMode("done");
      else setNotice("We couldn't finish this. Check the code on your card and try again.");
    },
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
    return (
      <Message
        title="Too many tries"
        body="Wait a few minutes and enter the code from your card again."
      />
    );
  }

  if (!plaque.data?.plaque) {
    return (
      <Message
        title="This link isn't valid"
        body="Activation codes only work once. If your plaque is already set up, open your portal instead."
      />
    );
  }

  const activePlaque = plaque.data.plaque;
  const searchResults = results.data?.results ?? [];
  const selectedGoal = GOALS.find((g) => g.value === goal)!;

  return (
    <Field>
      <div className="mx-auto max-w-md px-5 pt-8 pb-20">
        <Link to="/" aria-label="TapLocal home" className="mb-5 inline-block">
          <BrandLockup />
        </Link>

        <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
          Plaque {activePlaque.plaque_code}
        </p>

        {mode === "start" ? (
          <>
            <h1 className="mt-2 font-display text-[27px] leading-tight font-bold tracking-tight text-balance">
              Let's get your plaque working.
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
              About a minute. Nothing to install.
            </p>

            <div className="mt-5 space-y-3">
              <BigChoice
                icon={<Search className="h-5 w-5" />}
                title="Find my business"
                body="We'll pull your details from your public Google listing."
                onClick={() => setMode("search")}
              />
              <BigChoice
                icon={<Sparkles className="h-5 w-5" />}
                title="Just tell TapLocal"
                body="Say or type it in one sentence and we'll set it up."
                onClick={() => setMode("tell")}
              />
            </div>

            <div className="mt-4">
              <NfcReadyCheck expectedSlug={activePlaque.public_slug} />
            </div>
          </>
        ) : null}

        {mode === "tell" ? (
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
            <BackLink onClick={() => setMode("start")} />
          </GlassPanel>
        ) : null}

        {mode === "search" ? (
          <GlassPanel sheen className="mt-4 space-y-3 p-5">
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
                onClick={() => setMode("confirm")}
                className="text-[12px] font-semibold text-primary underline underline-offset-4"
              >
                Can't find it? Set it up by hand
              </button>
            ) : null}

            <BackLink onClick={() => setMode("start")} />
          </GlassPanel>
        ) : null}

        {mode === "confirm" ? (
          <GlassPanel sheen className="mt-4 space-y-4 p-5">
            <div>
              <h2 className="font-display text-[20px] leading-tight font-bold tracking-tight text-balance">
                {place ? "Is this you?" : "Tell us about your business"}
              </h2>
              {place ? (
                <div className="mt-3 rounded-xl border border-border bg-foreground/5 p-3.5">
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
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Your business name"
                  className="mt-3 w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
                />
              )}
            </div>

            <Section title="What do you want more of?">
              <Chips
                options={GOALS.map((g) => ({ value: g.value, label: g.label }))}
                value={goal}
                onChange={(v) => setGoal(v as (typeof GOALS)[number]["value"])}
              />
            </Section>

            {selectedGoal.destination !== "google_review" || !place?.placeId ? (
              <div>
                <input
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://… where a tap should send people"
                  className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
                />
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  You can change this any time from your portal.
                </p>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground text-pretty">
                Every tap opens your Google review box, ready to write.
              </p>
            )}

            <Section title="Where will it sit?">
              <Chips options={PLACEMENTS} value={placement} onChange={setPlacement} />
            </Section>

            <input
              value={plaqueName}
              onChange={(e) => setPlaqueName(e.target.value)}
              placeholder="Name it, e.g. Counter plaque"
              className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[15px] outline-none focus:border-primary/60"
            />

            <button
              type="button"
              disabled={goLive.isPending || (!place && query.trim().length < 2)}
              onClick={() => goLive.mutate()}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {goLive.isPending ? "Going live…" : "Go live"}
            </button>
            <BackLink onClick={() => setMode(place ? "search" : "start")} />
          </GlassPanel>
        ) : null}

        {mode === "done" ? (
          <GlassPanel sheen className="mt-4 p-5 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/20 text-accent">
              <Check className="h-6 w-6" />
            </span>
            <h2 className="mt-3 font-display text-[22px] font-bold tracking-tight">Your plaque is live</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
              Put it {PLACEMENTS.find((p) => p.value === placement)?.label.toLowerCase()} and tap it with your
              phone to try it. Create your account to see what happens next.
            </p>
            <Link
              to="/app"
              className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground"
            >
              Create my account
            </Link>
          </GlassPanel>
        ) : null}

        {notice ? <p className="mt-3 text-[12px] text-muted-foreground">{notice}</p> : null}
      </div>
    </Field>
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
      <span>
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground text-pretty">
          {body}
        </span>
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold">{title}</p>
      {children}
    </div>
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
