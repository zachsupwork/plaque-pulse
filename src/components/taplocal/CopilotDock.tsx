import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, ArrowUp, Mic, Square } from "lucide-react";
import { GlassPanel } from "./Field";
import { askCopilot } from "@/lib/copilot.functions";
import { useBusinessId } from "@/hooks/usePortal";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How are my reviews doing?",
  "Which plaque works best?",
  "Where should I move the quiet one?",
  "What changed this week?",
];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function CopilotDock({ compact = false }: { compact?: boolean }) {
  const { data: businessId } = useBusinessId();
  const ask = useServerFn(askCopilot);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceReady(Boolean(getRecognition()));
    return () => recRef.current?.stop();
  }, []);

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

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = "en-CA";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const words = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setDraft(words);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <GlassPanel tone={messages.length ? "default" : "signal"} className={compact ? "p-3.5" : "p-4"}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/20 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="font-display text-[14px] font-semibold tracking-tight">Ask TapLocal</p>
      </div>
      {messages.length === 0 ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Ask in your own words. Answers come only from your own numbers.
        </p>
      ) : null}

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
          placeholder={listening ? "Listening…" : "Ask anything about your plaques"}
          className="min-w-0 flex-1 rounded-xl border border-border bg-foreground/[0.06] px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        {voiceReady ? (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? "Stop listening" : "Speak your question"}
            className={
              listening
                ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive"
                : "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-foreground/5 text-muted-foreground"
            }
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        ) : null}
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
