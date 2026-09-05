import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Field, GlassPanel, EdgePanel } from "@/components/taplocal/Field";
import { BrandLockup, NfcMark } from "@/components/taplocal/Brand";
import { useIdentity } from "@/hooks/useAuthSession";
import plaqueTrio from "@/assets/plaque-trio.jpg";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TapLocal Digital — turn a tap into your next customer action" },
      {
        name: "description",
        content:
          "SmartPlaques make it easy for customers to review, follow, book or browse — while TapLocal shows you what is actually working.",
      },
      { property: "og:title", content: "TapLocal Digital — one tap, real business growth" },
      {
        property: "og:description",
        content:
          "A premium NFC and QR SmartPlaque for your counter, plus a portal that explains what customers actually did.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Marketing,
});

const variants = [
  {
    name: "Google Reviews",
    body: "White cloud face, five gold stars, Google-coloured edge.",
    surface: "cloud-surface",
    dot: "from-[#4285F4] via-[#EA4335] to-[#FBBC05]",
  },
  {
    name: "Instagram",
    body: "Soft pink face with a violet-to-orange edge for follows.",
    surface: "soft-marble",
    dot: "from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  {
    name: "Website",
    body: "Light smoke face that sends people to your own page.",
    surface: "smoke-surface",
    dot: "from-primary to-primary",
  },
  {
    name: "Menu",
    body: "Table-top plaque that opens today's menu instantly.",
    surface: "smoke-surface",
    dot: "from-primary via-accent to-primary",
  },
  {
    name: "Booking",
    body: "Reception plaque that opens your booking page.",
    surface: "cloud-surface",
    dot: "from-accent to-primary",
  },
  {
    name: "Custom",
    body: "Anything else — a form, a WhatsApp chat, a loyalty page.",
    surface: "soft-marble",
    dot: "from-primary via-[#DD2A7B] to-[#F5A524]",
  },
];

const steps = [
  { n: "1", title: "We prepare your plaque", body: "A unique SmartLink, NFC preprogrammed, QR paired." },
  { n: "2", title: "You receive it", body: "Ready out of the box. No app, no card, no NFC programming." },
  { n: "3", title: "Activate", body: "Find your business, or just tell TapLocal in one sentence." },
  { n: "4", title: "Place it", body: "Counter, table, entrance, reception — wherever people pause." },
  { n: "5", title: "Start learning", body: "Customers tap, TapLocal tracks, Copilot explains what works." },
];

const anatomy = [
  { label: "Front", body: "The printed, customer-facing design." },
  { label: "Inside", body: "The preprogrammed NFC chip." },
  { label: "Back", body: "Your unique QR and setup layer." },
  { label: "Outer back", body: "A “Tap here” cover sticker." },
];

function AccountArea() {
  const identity = useIdentity();
  const [open, setOpen] = useState(false);
  const signedIn = Boolean(identity.data?.signedIn);
  const isAdmin = Boolean(identity.data?.isAdmin);

  if (!signedIn) {
    return (
      <Link to="/auth" search={{ returnTo: "/app" }} className="text-[13px] font-semibold text-muted-foreground">
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[13px] font-semibold text-foreground"
        aria-expanded={open}
      >
        My Portal
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-card p-3 text-left shadow-[var(--shadow-soft)]">
            <p className="text-[11px] text-muted-foreground">Signed in as</p>
            <p className="truncate text-[13px] font-bold">{identity.data?.email ?? "Your account"}</p>
            <div className="mt-3 space-y-1.5">
              <Link
                to="/app"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
              >
                My Portal
              </Link>
              {isAdmin ? (
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
                >
                  TapLocal Admin
                </Link>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Mobile menu: every important destination in one tap. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const identity = useIdentity();
  const signedIn = Boolean(identity.data?.signedIn);
  const isAdmin = Boolean(identity.data?.isAdmin);
  const item = "block rounded-xl border border-border px-3 py-2.5 text-[14px] font-semibold";
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
      >
        Menu
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={close}
          />
          <div className="absolute inset-x-3 z-50 mt-2 space-y-1.5 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
            <a href="#top" onClick={close} className={item}>Home</a>
            <a href="#how" onClick={close} className={item}>How it works</a>
            <a href="#plaques" onClick={close} className={item}>SmartPlaques</a>
            <Link to="/activate/$token" params={{ token: "demo-activation-token" }} onClick={close} className={item}>
              Activate a plaque
            </Link>
            {signedIn ? (
              <Link to="/app" onClick={close} className={item}>My Portal</Link>
            ) : (
              <Link to="/auth" search={{ returnTo: "/app" }} onClick={close} className={item}>Sign in</Link>
            )}
            {isAdmin ? (
              <Link to="/admin" onClick={close} className={item}>TapLocal Admin</Link>
            ) : null}
            <Link to="/demo" onClick={close} className={item}>Demo</Link>
            <a href="mailto:support@taplocal.digital" onClick={close} className={item}>Support</a>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SiteFooter() {
  const identity = useIdentity();
  const signedIn = Boolean(identity.data?.signedIn);
  const link = "hover:text-foreground";

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6">
        <BrandLockup suffix="Digital" />
        <p className="text-[12px] text-muted-foreground">Physical to digital, for local business.</p>
      </div>
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 pb-4 text-[13px] text-muted-foreground">
        <Link to="/" className={link}>Home</Link>
        <a href="#how" className={link}>How it works</a>
        <Link to="/activate/$token" params={{ token: "demo-activation-token" }} className={link}>
          Activate a plaque
        </Link>
        {signedIn ? (
          <Link to="/app" className={link}>My Portal</Link>
        ) : (
          <Link to="/auth" search={{ returnTo: "/app" }} className={link}>Sign in</Link>
        )}
        <a href="mailto:support@taplocal.digital" className={link}>Support</a>
        <span className={link}>Privacy</span>
        <span className={link}>Terms</span>
      </nav>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 pb-6 text-[12px] text-muted-foreground">
        <span>© TapLocal Digital</span>
        <Link to="/admin" className="hover:text-foreground">Admin</Link>
      </div>
    </footer>
  );
}

function Marketing() {
  return (
    <Field>
      <header id="top" className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-xl">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-3">

          <Link to="/" aria-label="TapLocal Digital home"><BrandLockup suffix="Digital" /></Link>
          <nav className="hidden items-center gap-6 text-[13px] font-medium text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#plaques" className="hover:text-foreground">SmartPlaques</a>
            <a href="#anatomy" className="hover:text-foreground">For businesses</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 md:flex">
              <AccountArea />
              <Link
                to="/activate/$token"
                params={{ token: "demo-activation-token" }}
                className="rounded-xl bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground shadow-[var(--shadow-brand)]"
              >
                Activate my plaque
              </Link>
            </div>
            <MobileMenu />
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10 md:grid md:grid-cols-2 md:items-center md:gap-12 md:pt-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
              <NfcMark className="h-4 w-4 text-primary" /> NFC + QR, preprogrammed
            </span>
            <h1 className="mt-4 max-w-xl text-[38px] leading-[1.04] font-bold tracking-tight text-balance md:text-[56px]">
              Turn a tap into your next <span className="gradient-text">customer action</span>.
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground text-pretty md:text-[16px]">
              SmartPlaques make it easy for customers to review, follow, book, browse or connect —
              while TapLocal shows you what is actually working.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                to="/activate/$token"
                params={{ token: "demo-activation-token" }}
                className="rounded-xl bg-primary px-5 py-3.5 text-[13px] font-bold tracking-wide text-primary-foreground uppercase shadow-[var(--shadow-brand)]"
              >
                Activate my plaque
              </Link>
              <Link
                to="/auth"
                search={{ returnTo: "/app" }}
                className="rounded-xl border border-border bg-card px-5 py-3.5 text-[13px] font-bold tracking-wide uppercase"
              >
                Sign in
              </Link>
              <a
                href="#how"
                className="rounded-xl border border-border bg-card px-5 py-3.5 text-[13px] font-bold tracking-wide uppercase"
              >
                See how it works
              </a>
              <Link to="/demo" className="px-2 py-3.5 text-[13px] font-semibold text-primary">
                View live demo
              </Link>

            </div>
          </div>

          <div className="mt-10 md:mt-0">
            <img
              src={plaqueTrio}
              alt="Three TapLocal SmartPlaques: white marble Google review, soft pink Instagram and black marble premium"
              width={1600}
              height={1104}
              className="w-full rounded-3xl"
            />
          </div>
        </section>

        <section id="plaques" className="mt-20">
          <p className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Choose what you want customers to do
          </p>
          <h2 className="mt-2 max-w-xl text-[26px] leading-tight font-bold tracking-tight md:text-[34px]">
            One plaque, one clear action.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {variants.map((v) => (
              <EdgePanel key={v.name}>
                <div className={`${v.surface} rounded-[1.3rem] p-5`}>
                  <div className="flex items-start justify-between">
                    <span className={`h-2.5 w-16 rounded-full bg-gradient-to-r ${v.dot}`} />
                    <NfcMark className="h-9 w-9 text-foreground/70" />
                  </div>
                  <p className="mt-8 font-display text-[17px] font-bold tracking-tight">{v.name}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">{v.body}</p>
                </div>
              </EdgePanel>
            ))}
          </div>

          <div className="premium-marble-dark mt-4 rounded-3xl p-6 md:p-9">
            <p className="text-[12px] font-bold tracking-[0.12em] uppercase opacity-70">Premium edition</p>
            <h3 className="mt-2 max-w-md text-[24px] leading-tight font-bold tracking-tight text-inherit md:text-[30px]">
              Black marble, gold type, white contactless mark.
            </h3>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed opacity-80">
              For dining rooms and reception desks where the plaque should look like part of the room.
            </p>
          </div>
        </section>

        <section id="how" className="mt-20">
          <p className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground uppercase">How it works</p>
          <h2 className="mt-2 text-[26px] leading-tight font-bold tracking-tight md:text-[34px]">
            Out of the box to first insight.
          </h2>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {steps.map((s) => (
              <GlassPanel key={s.n} className="p-5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-display text-[14px] font-bold text-primary">
                  {s.n}
                </span>
                <p className="mt-3 font-display text-[15px] font-bold tracking-tight">{s.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">{s.body}</p>
              </GlassPanel>
            ))}
          </div>
        </section>

        <section id="anatomy" className="mt-20">
          <GlassPanel tone="frost" className="p-6 md:p-10">
            <p className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
              Inside a SmartPlaque
            </p>
            <h2 className="mt-2 text-[26px] leading-tight font-bold tracking-tight md:text-[34px]">
              Four layers of clear acrylic.
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {anatomy.map((a) => (
                <div key={a.label} className="rounded-2xl border border-border bg-card p-5">
                  <div className="gradient-rule w-10" />
                  <p className="mt-3 font-display text-[14px] font-bold tracking-[0.06em] uppercase">{a.label}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">{a.body}</p>
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-16">
          <EdgePanel>
            <div className="cloud-surface rounded-[1.3rem] p-6 md:flex md:items-center md:justify-between md:p-9">
              <div>
                <p className="font-display text-[20px] font-bold tracking-tight md:text-[26px]">
                  Already have one?
                </p>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground text-pretty">
                  Scan the private activation QR inside your package. Setup takes about sixty seconds.
                </p>
              </div>
              <Link
                to="/activate/$token"
                params={{ token: "demo-activation-token" }}
                className="mt-4 inline-block rounded-xl bg-primary px-5 py-3.5 text-[13px] font-bold tracking-wide text-primary-foreground uppercase shadow-[var(--shadow-brand)] md:mt-0"
              >
                Activate your SmartPlaque
              </Link>
            </div>
          </EdgePanel>
        </section>
      </main>

      <SiteFooter />


    </Field>
  );
}
