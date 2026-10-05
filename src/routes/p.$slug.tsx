import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Share2 } from "lucide-react";
import { getPublicPage } from "@/lib/business-page.functions";
import { smartlinkBase } from "@/lib/smartlink";

const searchSchema = z.object({
  t: z.string().optional(),
  src: z.enum(["nfc", "qr"]).optional(),
  rv: z.string().optional(),
  tl_test: z.string().optional(),
});

export const Route = createFileRoute("/p/$slug")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    const page = await getPublicPage({
      data: { key: params.slug, t: uuid(deps.t), src: deps.src, rv: uuid(deps.rv), test: deps.tl_test === "1" },
    });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.name} — TapLocal` : "TapLocal Page";
    const desc = loaderData?.description || "Reviews, socials, menu and more in one tap.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  notFoundComponent: () => (
    <main className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">This page isn't available.</main>
  ),
  component: PublicPage,
});

function PublicPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const [copied, setCopied] = useState(false);

  const qs = new URLSearchParams();
  if (search.t) qs.set("t", search.t);
  if (search.src) qs.set("src", search.src);
  if (search.rv) qs.set("rv", search.rv);
  if (search.tl_test) qs.set("tl_test", search.tl_test);
  if (page.viewId) qs.set("v", page.viewId);
  const suffix = qs.toString() ? `?${qs}` : "";

  async function share() {
    const url = `${smartlinkBase()}/r/${page.shareCode}`;
    try {
      if (navigator.share) await navigator.share({ title: page.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10" style={{ ["--accent-page" as string]: page.accent }}>
      <div className="mx-auto max-w-sm text-center">
        {page.logoUrl ? (
          <img src={page.logoUrl} alt={page.name} className="mx-auto h-24 w-24 rounded-full border border-border object-cover" />
        ) : (
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full font-display text-3xl font-bold text-primary-foreground" style={{ background: "var(--accent-page)" }}>
            {page.name.slice(0, 1)}
          </div>
        )}
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">{page.name}</h1>
        {page.description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{page.description}</p> : null}

        <div className="mt-7 space-y-3">
          {page.buttons.map((b) => (
            <a
              key={b.id}
              href={`/go/${page.key}/${b.id}${suffix}`}
              className="block rounded-2xl px-5 py-4 text-[15px] font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent-page)" }}
            >
              {b.label}
            </a>
          ))}
          {!page.buttons.length ? <p className="text-sm text-muted-foreground">No links yet.</p> : null}
        </div>

        <button type="button" onClick={share} className="mt-8 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium">
          <Share2 className="h-4 w-4" /> {copied ? "Link copied" : "Share this business"}
        </button>
        <p className="mt-8 text-[11px] text-muted-foreground">Powered by TapLocal</p>
      </div>
    </main>
  );
}
