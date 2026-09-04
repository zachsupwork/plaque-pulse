import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isProductionSmartlinkDomain, nfcUrl, smartlinkBase, SMARTLINK_PRODUCTION_ORIGIN } from "@/lib/smartlink";

export type SmartlinkCheck = {
  url: string;
  base: string;
  production: boolean;
  hostReachable: boolean;
  plaqueExists: boolean;
  destinationConfigured: boolean;
  redirectReady: boolean;
  ready: boolean;
  problem: string | null;
};

/**
 * Health check run before a tag is ever programmed, so we can never manufacture a tag
 * carrying a dead URL.
 */
export const checkSmartlink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1).max(40) }).parse(data))
  .handler(async ({ data }): Promise<SmartlinkCheck> => {
    const base = smartlinkBase();
    const url = nfcUrl(data.slug);
    const production = isProductionSmartlinkDomain();

    let hostReachable = false;
    try {
      const response = await fetch(`${base}/n/${data.slug}`, { method: "HEAD", redirect: "manual" });
      hostReachable = response.status > 0;
    } catch {
      hostReachable = false;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, status")
      .eq("public_slug", data.slug)
      .maybeSingle();

    let destinationConfigured = false;
    if (plaque) {
      const { data: destination } = await supabaseAdmin
        .from("destinations")
        .select("id")
        .eq("plaque_id", plaque.id)
        .is("effective_to", null)
        .eq("active", true)
        .maybeSingle();
      destinationConfigured = Boolean(destination);
    }

    const plaqueExists = Boolean(plaque);
    const redirectReady = hostReachable && plaqueExists && plaque?.status !== "retired";
    const ready = redirectReady && destinationConfigured;

    const problem = !hostReachable
      ? "TapLocal SmartLink domain is not live yet."
      : !plaqueExists
        ? "We can't find this tag in TapLocal."
        : !destinationConfigured
          ? "This tag doesn't have a destination yet."
          : null;

    return { url, base, production, hostReachable, plaqueExists, destinationConfigured, redirectReady, ready, problem };
  });

/** Status of the TapLocal domains, for the admin/settings infrastructure panel. */
export const smartlinkInfrastructure = createServerFn({ method: "GET" }).handler(async () => {
  const base = smartlinkBase();
  const production = base === SMARTLINK_PRODUCTION_ORIGIN;

  async function probe(origin: string) {
    try {
      const response = await fetch(origin, { method: "HEAD", redirect: "manual" });
      return response.status > 0;
    } catch {
      return false;
    }
  }

  const [mainLive, shortLive] = await Promise.all([probe("https://taplocaldigital.com"), probe(SMARTLINK_PRODUCTION_ORIGIN)]);

  return {
    base,
    production,
    mainDomain: { host: "taplocaldigital.com", active: mainLive },
    smartlinkDomain: { host: "go.taplocaldigital.com", active: shortLive },
    activeBaseReachable: await probe(base),
  };
});
