import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const inputSchema = z.object({
  businessId: z.string().uuid(),
  question: z.string().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(12)
    .default([]),
});

type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const TOOLS: Tool[] = [
  {
    name: "get_plaques",
    description:
      "List the business's plaques with their code, name, placement, status and current destination.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_interactions",
    description:
      "Interaction counts. Returns totals for the last N days, the previous N days, per-plaque counts, and the split between NFC taps and QR scans.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Window size in days, default 30" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_outcomes",
    description:
      "Results attributed to plaque activity. Each has an attribution_type: direct (proven), correlated (moved at the same time), or unknown.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_metric_snapshots",
    description:
      "Connected-account metrics over time, such as Google review count, star rating and Instagram followers.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_recent_changes",
    description:
      "Recent destination changes, placement moves and actions taken on the account, newest first.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];

const SYSTEM = `You are the TapLocal Copilot, talking to a busy local business owner.

Rules you never break:
- Never state a number you did not get from a tool call. If you lack data, call a tool. If a tool returns nothing, say you don't have that yet.
- Speak plain English. No analytics jargon: say "taps", "customers", "reviews", not "conversion rate", "CTR", "sessions".
- Be honest about certainty. Say "we can prove this" only for direct outcomes. For correlated outcomes say something like "your reviews went up over the same period, which lines up, but we can't prove the plaque caused it".
- Two to four short sentences. No bullet lists unless comparing plaques.
- You may suggest a change, but you cannot make one. If the owner wants a change, tell them which screen to tap and that you'll ask them to confirm first.`;

function summarise(rows: unknown[], limit = 40) {
  return rows.slice(0, limit);
}

export const askCopilot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { answer: "The assistant isn't configured yet.", usedTools: [] as string[] };

    const authHeader = getRequest().headers.get("authorization") ?? "";
    const supabase = createClient(
      process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: authHeader ? { headers: { Authorization: authHeader } } : {},
      },
    );

    const b = data.businessId;

    async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      if (name === "get_plaques") {
        const { data: plaques } = await supabase
          .from("plaques")
          .select("id, plaque_code, plaque_name, placement_type, status, product_type")
          .eq("business_id", b);
        const { data: dests } = await supabase
          .from("destinations")
          .select("plaque_id, destination_type, destination_url, effective_from, effective_to")
          .eq("business_id", b);
        return {
          plaques: plaques ?? [],
          current_destinations: (dests ?? []).filter((d) => d.effective_to === null),
          past_destinations: (dests ?? []).filter((d) => d.effective_to !== null),
        };
      }

      if (name === "get_interactions") {
        const days = typeof args["days"] === "number" ? Math.min(365, Math.max(1, args["days"])) : 30;
        const since = new Date(Date.now() - days * 2 * 86400000).toISOString();
        const { data: events } = await supabase
          .from("events")
          .select("plaque_id, event_type, source_type, intent_type, occurred_at")
          .eq("business_id", b)
          .gte("occurred_at", since)
          .limit(5000);
        const list = (events ?? []).filter((e) => e.event_type === "interaction");
        const cut = Date.now() - days * 86400000;
        const recent = list.filter((e) => new Date(e.occurred_at).getTime() >= cut);
        const previous = list.filter((e) => new Date(e.occurred_at).getTime() < cut);
        const perPlaque: Record<string, number> = {};
        for (const e of recent) if (e.plaque_id) perPlaque[e.plaque_id] = (perPlaque[e.plaque_id] ?? 0) + 1;
        return {
          window_days: days,
          interactions_this_window: recent.length,
          interactions_previous_window: previous.length,
          per_plaque: perPlaque,
          nfc_taps: recent.filter((e) => e.source_type === "nfc").length,
          qr_scans: recent.filter((e) => e.source_type === "qr").length,
        };
      }

      if (name === "get_outcomes") {
        const { data: rows } = await supabase
          .from("outcomes")
          .select("outcome_type, attribution_type, value_estimate, occurred_at, notes")
          .eq("business_id", b)
          .order("occurred_at", { ascending: false });
        return summarise(rows ?? [], 100);
      }

      if (name === "get_metric_snapshots") {
        const { data: rows } = await supabase
          .from("metric_snapshots")
          .select("metric_key, metric_value, captured_at, source")
          .eq("business_id", b)
          .order("captured_at", { ascending: true });
        return summarise(rows ?? [], 100);
      }

      if (name === "get_recent_changes") {
        const { data: actions } = await supabase
          .from("action_history")
          .select("action_type, description, initiated_by, created_at")
          .eq("business_id", b)
          .order("created_at", { ascending: false })
          .limit(20);
        const { data: placements } = await supabase
          .from("plaque_placement_history")
          .select("plaque_id, placement_type, moved_at, note")
          .eq("business_id", b)
          .order("moved_at", { ascending: false })
          .limit(20);
        return { actions: actions ?? [], placement_moves: placements ?? [] };
      }

      return { error: "unknown tool" };
    }

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM },
      ...data.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.question },
    ];

    const usedTools: string[] = [];

    for (let turn = 0; turn < 4; turn += 1) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages,
          tools: TOOLS.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }),
      });

      if (res.status === 429)
        return { answer: "The assistant is busy right now — try again in a moment.", usedTools };
      if (res.status === 402)
        return { answer: "The assistant is out of credit for now.", usedTools };
      if (!res.ok) return { answer: "The assistant couldn't answer that just now.", usedTools };

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
      };
      const message = body.choices?.[0]?.message;
      if (!message) return { answer: "The assistant couldn't answer that just now.", usedTools };

      if (message.tool_calls?.length) {
        messages.push(message as Record<string, unknown>);
        for (const call of message.tool_calls) {
          usedTools.push(call.function.name);
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          const result = await runTool(call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }

      return { answer: message.content ?? "I don't have an answer for that yet.", usedTools };
    }

    return { answer: "That one needed more digging than I could do in one go.", usedTools };
  });
