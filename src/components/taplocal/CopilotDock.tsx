import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, ArrowUp } from "lucide-react";
import { GlassPanel } from "./Field";
import { askCopilot } from "@/lib/copilot.functions";
import { useBusinessId } from "@/hooks/usePortal";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Which plaque is doing best?",
  "Did my reviews actually go up?",
  "Where should I move the quiet plaque?",
];

export function CopilotDock() {
  const { data: businessId } = useBusinessId();
  const ask = useServerFn(askCopilot);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");

  const mutation = useMutation({
    mutationFn: async (question: string) => {
      if (!businessId) throw new Error("no business");
      return ask({ data: { businessId, question, history: messages.slice(-8) } });
    },
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.answer }]),
    onError: () =>
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I couldn't reach your numbers just then. Try again?" },
      ]),
  });

  function send(question: string) {
    const q = question.trim();
    if (!q || mutation.isPending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setDraft("");
    mutation.mutate(q);
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/20 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="font-display text-[14px] font-semibold tracking-tight">Ask about your plaques</p>
      </div>

      {messages.length === 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-[12px] font-medium text-muted-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[13px] font-medium text-primary-foreground"
                  : "max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-foreground/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-pretty"
              }
            >
              {m.content}
            </div>
          ))}
          {mutation.isPending ? (
            <p className="text-[12px] text-muted-foreground">Checking your numbers…</p>
          ) : null}
        </div>
      )}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything about your plaques"
          className="min-w-0 flex-1 rounded-xl border border-border bg-foreground/5 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Send question"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </GlassPanel>
  );
}
