import { createFileRoute, Link } from "@tanstack/react-router";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import heroImage from "@/assets/smartplaque-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TapLocal SmartPlaque — turn a tap into a review" },
      {
        name: "description",
        content:
          "One tap sends your customer to Google, Instagram, your menu or your booking page. TapLocal shows you which plaque, which placement and which action actually works.",
      },
      { property: "og:title", content: "TapLocal SmartPlaque — turn a tap into a review" },
      {
        property: "og:description",
        content:
          "You decide what you want customers to do. TapLocal shows you how they respond.",
      },
    ],
  }),
  component: Marketing,
});

const surfaces = [
  {
    name: "SmartPlaque",
    body: "The physical touchpoint. NFC and QR on a single plaque, placed where your customers already stand.",
  },
  {
    name: "SmartLink",
    body: "The routing layer. Every tap is validated, recorded and redirected in a fraction of a second.",
  },
  {
    name: "Copilot",
    body: "The intelligence layer. Ask a plain question, get an answer built only from your own numbers.",
  },
];

function Marketing() {
  return (
    <Field>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground shadow-[var(--shadow-brand)]">
            T
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight">TapLocal</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/demo" className="text-[13px] font-semibold text-muted-foreground">
            Live demo
          </Link>
          <Link
            to="/auth"
            className="rounded-xl border border-border bg-foreground/10 px-3.5 py-2 text-[13px] font-semibold"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20">
        <section className="pt-12">
          <p className="text-[13px] font-medium text-muted-foreground">Physical to digital, for local business</p>
          <h1 className="mt-2 max-w-2xl text-[34px] leading-[1.05] font-bold tracking-tight text-balance sm:text-[52px]">
            You decide what you want customers to do. TapLocal shows you how they respond.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
            A SmartPlaque on your counter. One tap to a Google review, an Instagram follow, a menu or a
            booking. Every interaction lands in a portal that speaks plain English.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/activate/$token"
              params={{ token: "demo-activation-token" }}
              className="rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground shadow-[var(--shadow-brand)]"
            >
              Activate my plaque
            </Link>
            <Link
              to="/demo"
              className="rounded-xl border border-border bg-foreground/10 px-5 py-3 text-[13px] font-bold"
            >
              See a live demo
            </Link>
          </div>

          <GlassPanel className="mt-10 p-2">
            <img
              src={heroImage}
              alt="A TapLocal SmartPlaque with a glowing contactless icon on a restaurant counter"
              width={1200}
              height={912}
              className="w-full rounded-xl object-cover"
            />
          </GlassPanel>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Three layers, one product</h2>
          <div className="mt-3 space-y-2.5">
            {surfaces.map((s) => (
              <GlassPanel key={s.name} className="p-3.5">
                <p className="text-[14px] font-semibold">{s.name}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">{s.body}</p>
              </GlassPanel>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <p className="font-display text-[13px] font-semibold tracking-wide">Just received your plaque?</p>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">
            Scan the private activation QR inside your package. Setup takes about sixty seconds — no app, no
            card, no NFC programming.
          </p>
          <Link
            to="/activate/$token"
            params={{ token: "demo-activation-token" }}
            className="mt-3 inline-block rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground shadow-[var(--shadow-brand)]"
          >
            Try the activation flow
          </Link>
        </section>
      </main>
    </Field>
  );
}
