import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Turns "Pi Co on Metcalfe, Google reviews, front counter" into structured setup hints.
 * It NEVER decides which real business this is — the owner still confirms a real Google listing.
 */
export const parseActivationCommand = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ text: z.string().min(3).max(500) }).parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "unavailable" as const, parsed: null };

    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("parse-command", 30)))
      return { ok: false as const, error: "rate_limited" as const, parsed: null };

    const system = `You turn a shop owner's plain sentence into setup fields for a tap-plaque.
Return ONLY JSON matching this shape, no prose:
{"business_query":string,"location_hint":string|null,"goal_type":"google_reviews"|"instagram_followers"|"bookings"|"leads"|"orders"|"menu_views"|"website_visits"|"calls"|"directions"|"offers"|null,
"destination_type":"google_review"|"instagram"|"facebook"|"menu"|"booking"|"website"|"call"|"directions"|"quote"|"coupon"|"custom"|null,
"placement_type":"front_counter"|"checkout"|"table"|"reception"|"entrance"|"exit"|"bar"|"waiting_area"|"hotel_room"|"vehicle"|"other"|null,
"plaque_name":string|null,"social_handle":string|null,
"confidence":{"business":number,"goal":number,"placement":number}}
Rules: business_query is only the words the owner used for their business name. Never invent a business, address, or handle. Use null when the sentence does not say.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: data.text },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (res.status === 429) return { ok: false as const, error: "busy" as const, parsed: null };
      if (res.status === 402) return { ok: false as const, error: "no_credit" as const, parsed: null };
      if (!res.ok) return { ok: false as const, error: "failed" as const, parsed: null };

      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as Record<string, unknown>;

      const shape = z.object({
        business_query: z.string().max(160).nullable().catch(null),
        location_hint: z.string().max(160).nullable().catch(null),
        goal_type: z.string().max(60).nullable().catch(null),
        destination_type: z.string().max(60).nullable().catch(null),
        placement_type: z.string().max(60).nullable().catch(null),
        plaque_name: z.string().max(80).nullable().catch(null),
        social_handle: z.string().max(80).nullable().catch(null),
      });

      return { ok: true as const, error: null, parsed: shape.parse(parsed) };
    } catch {
      return { ok: false as const, error: "failed" as const, parsed: null };
    }
  });
