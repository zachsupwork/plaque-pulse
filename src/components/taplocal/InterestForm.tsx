import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { submitInquiry } from "@/lib/offerings.functions";
import { searchBusinesses } from "@/lib/business-discovery.functions";
import { useIdentity } from "@/hooks/useAuthSession";

type Props = {
  offeringId: string | null;
  offeringName: string;
  physical: boolean;
  source?: string;
  /** Finish, base, quantity etc. chosen on the product page before opening this. */
  selections?: Record<string, string>;
  onClose: () => void;
};

const QUANTITIES = ["1", "2", "4", "5+", "Not sure"] as const;
const CONTACT = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
] as const;

const inputClass =
  "w-full rounded-xl border border-border bg-foreground/[0.04] px-3.5 py-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary/60";

/** The 20-second "I'm interested" flow: ask little, never block on Google. */
export function InterestForm({
  offeringId,
  offeringName,
  physical,
  source = "website",
  selections,
  onClose,
}: Props) {
  const chosen = Object.entries(selections ?? {}).filter(([, v]) => v);
  const identity = useIdentity();
  const send = useServerFn(submitInquiry);
  const search = useServerFn(searchBusinesses);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState<"email" | "phone" | "text">("email");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [quantity, setQuantity] = useState<string>(
    selections?.["Quantity"] || (physical ? "Not sure" : ""),
  );
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ placeId: string; name: string; address: string }[]>([]);
  const sessionToken = useMemo(() => Math.random().toString(36).slice(2) + Date.now().toString(36), []);

  useEffect(() => {
    if (identity.data?.signedIn && identity.data.email && !email) setEmail(identity.data.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.data?.signedIn]);

  async function findBusiness() {
    if (businessName.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await search({ data: { query: businessName.trim(), sessionToken } });
      setResults(
        (res.results ?? []).map((r: { placeId: string; name: string; address?: string | null }) => ({
          placeId: r.placeId,
          name: r.name,
          address: r.address ?? "",
        })),
      );
    } catch {
      setResults([]);
    }
    setSearching(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setErrorText(null);
    const res = await send({
      data: {
        offeringId,
        name: name.trim(),
        email: email.trim(),
        phone,
        preferredContactMethod: contact,
        businessName,
        businessAddress,
        googlePlaceId: placeId,
        quantityInterest: physical ? quantity : "",
        message: chosen.length
          ? `${chosen.map(([k, v]) => `${k}: ${v}`).join("\n")}${message ? `\n\n${message}` : ""}`
          : message,
        source,
      },
    });
    if (res.ok) {
      setState("sent");
      return;
    }
    setState("error");
    setErrorText(
      res.error === "rate_limited"
        ? "Too many requests just now. Try again in a minute."
        : "That didn't send. Check your email address and try again.",
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-[20px] leading-tight font-bold tracking-tight">
            {state === "sent" ? "Thank you" : `Interested in ${offeringName}?`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {state === "sent" ? (
          <div className="mt-3">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              We received your interest in {offeringName}. TapLocal will follow up with you.
            </p>
            <div className="mt-5 space-y-2">
              <Link
                to="/offerings"
                onClick={onClose}
                className="block rounded-xl bg-primary px-4 py-3 text-center text-[13px] font-bold tracking-wide text-primary-foreground uppercase"
              >
                View more offerings
              </Link>
              <Link
                to="/"
                onClick={onClose}
                className="block rounded-xl border border-border px-4 py-3 text-center text-[13px] font-bold tracking-wide uppercase"
              >
                Back to TapLocal
              </Link>
              {physical ? (
                <Link
                  to="/activate"
                  onClick={onClose}
                  className="block py-2 text-center text-[13px] font-semibold text-primary"
                >
                  Activate a plaque
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              We'll help you figure out the best setup.
            </p>

            {chosen.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chosen.map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded-xl border border-border bg-foreground/[0.04] px-2.5 py-1.5 text-[12px] font-semibold"
                  >
                    <span className="text-muted-foreground">{k}: </span>
                    {v}
                  </span>
                ))}
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Your name *"
                className={inputClass}
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="Email *"
                className={inputClass}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                placeholder="Phone"
                className={inputClass}
              />

              <div>
                <div className="flex gap-2">
                  <input
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      setPlaceId("");
                    }}
                    maxLength={200}
                    placeholder="Business name"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={findBusiness}
                    className="shrink-0 rounded-xl border border-border px-3 text-[12px] font-bold tracking-wide uppercase"
                  >
                    {searching ? "…" : "Search"}
                  </button>
                </div>
                {results.length ? (
                  <div className="mt-2 space-y-1 rounded-xl border border-border p-1.5">
                    {results.slice(0, 5).map((r) => (
                      <button
                        key={r.placeId}
                        type="button"
                        onClick={() => {
                          setBusinessName(r.name);
                          setBusinessAddress(r.address);
                          setPlaceId(r.placeId);
                          setResults([]);
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-[13px]"
                      >
                        <span className="font-semibold">{r.name}</span>
                        <span className="block text-[12px] text-muted-foreground">{r.address}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {placeId ? (
                  <p className="mt-1.5 text-[12px] text-accent">Matched: {businessAddress}</p>
                ) : null}
              </div>

              {physical ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Approximate quantity
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUANTITIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuantity(q)}
                        className={`rounded-xl border px-3 py-2 text-[13px] font-semibold ${
                          quantity === q ? "border-primary bg-primary/10 text-primary" : "border-border"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Preferred contact
                </p>
                <div className="flex gap-1.5">
                  {CONTACT.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setContact(c.value)}
                      className={`rounded-xl border px-3 py-2 text-[13px] font-semibold ${
                        contact === c.value ? "border-primary bg-primary/10 text-primary" : "border-border"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="How can we help?"
                className={inputClass}
              />

              <button
                type="submit"
                disabled={state === "sending"}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold tracking-wide text-primary-foreground uppercase disabled:opacity-60"
              >
                {state === "sending" ? "Sending…" : "Send"}
              </button>
              {errorText ? <p className="text-[13px] text-destructive">{errorText}</p> : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
