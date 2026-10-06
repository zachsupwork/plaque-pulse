import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, ExternalLink } from "lucide-react";
import { GlassPanel } from "@/components/taplocal/Field";
import { getMyPage, saveMyPage, setPlaqueMode, suggestPageButtons } from "@/lib/business-page.functions";

type Kind = "google_review" | "instagram" | "menu" | "website" | "booking" | "directions" | "call" | "facebook" | "tiktok" | "offer" | "loyalty" | "custom";
type Btn = { id: string; kind: Kind; label: string; url: string; enabled: boolean };

const KINDS: Array<[Kind, string]> = [
  ["google_review", "Leave a Google review"], ["instagram", "Follow on Instagram"], ["menu", "See the menu"],
  ["website", "Order / Website"], ["booking", "Book now"], ["directions", "Get directions"], ["call", "Call us"],
  ["facebook", "Facebook"], ["tiktok", "TikTok"], ["offer", "Today's offer"], ["loyalty", "Join our rewards"], ["custom", "Link"],
];

const ACCENTS = ["#3b82f6", "#10b981", "#f97316", "#e11d48", "#8b5cf6", "#111827"];

export function TapLocalPageEditor({ businessId, plaqueId }: { businessId: string; plaqueId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getMyPage);
  const save = useServerFn(saveMyPage);
  const setMode = useServerFn(setPlaqueMode);
  const suggest = useServerFn(suggestPageButtons);
  const q = useQuery({ queryKey: ["tl-page", businessId], queryFn: () => load({ data: { businessId } }) });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accent, setAccent] = useState("#3b82f6");
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const p = q.data?.page;
    if (!p) return;
    setTitle(p.title ?? ""); setDescription(p.description ?? ""); setLogoUrl(p.logo_url ?? "");
    setAccent(p.accent); setButtons(p.buttons as Btn[]);
  }, [q.data]);

  const plaque = q.data?.plaques.find((p) => p.id === plaqueId);
  const mode = plaque?.destination_mode === "page" ? "page" : "direct";

  const modeMut = useMutation({
    mutationFn: (m: "direct" | "page") => setMode({ data: { businessId, plaqueId, mode: m } }),
    onSuccess: (_r, m) => {
      toast.success(m === "page" ? "New taps now open your TapLocal Page." : "New taps go straight to your destination.");
      qc.invalidateQueries({ queryKey: ["tl-page", businessId] });
    },
    onError: () => toast.error("That didn't save."),
  });

  const saveMut = useMutation({
    mutationFn: () => save({ data: { businessId, title: title || null, description: description || null, logoUrl: logoUrl || null, accent, buttons } }),
    onSuccess: () => { toast.success("TapLocal Page saved."); qc.invalidateQueries({ queryKey: ["tl-page", businessId] }); },
    onError: (e) => toast.error(e instanceof Error && e.message.includes("demo") ? "The demo can't be changed." : "Check each link starts with https:// or tel:."),
  });

  const move = (i: number, d: -1 | 1) => setButtons((bs) => {
    const next = [...bs]; const j = i + d; if (j < 0 || j >= next.length) return bs;
    const a = next[i]!; next[i] = next[j]!; next[j] = a; return next;
  });
  const patch = (i: number, p: Partial<Btn>) => setButtons((bs) => bs.map((b, k) => (k === i ? { ...b, ...p } : b)));

  if (q.isLoading || !q.data) return null;
  const slug = plaque?.public_slug;

  return (
    <GlassPanel className="p-4">
      <p className="font-display text-[14px] font-semibold tracking-tight">What happens on a tap</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["direct", "page"] as const).map((m) => (
          <button key={m} type="button" disabled={modeMut.isPending} onClick={() => m !== mode && modeMut.mutate(m)}
            className={`rounded-xl border px-3 py-2.5 text-left text-[12px] ${m === mode ? "border-primary bg-primary/10" : "border-border bg-foreground/5"}`}>
            <span className="block font-semibold">{m === "direct" ? "Direct" : "TapLocal Page"}</span>
            <span className="text-muted-foreground">{m === "direct" ? "Opens one link straight away" : "Opens a page with all your links"}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Your plaque and QR code stay exactly the same either way.</p>

      <div className="mt-3 flex gap-2">
        {slug ? (
          <a href={`/p/${slug}?tl_test=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium">
            <ExternalLink className="h-3.5 w-3.5" /> Preview page
          </a>
        ) : null}
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full border border-border px-3 py-1.5 text-[12px] font-medium">
          {editing ? "Close editor" : "Edit page"}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Input label="Business name" value={title} onChange={setTitle} />
          <Input label="Short description" value={description} onChange={setDescription} />
          <Input label="Logo or photo link (https://)" value={logoUrl} onChange={setLogoUrl} />
          <div>
            <p className="text-[12px] text-muted-foreground">Accent colour</p>
            <div className="mt-1.5 flex items-center gap-2">
              {ACCENTS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setAccent(c)}
                  className={`h-7 w-7 rounded-full border-2 ${accent === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
              ))}
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-7 w-9 bg-transparent" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Buttons</p>
            {buttons.map((b, i) => (
              <div key={b.id} className={`rounded-xl border border-border p-2.5 ${b.enabled ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-1.5">
                  <input value={b.label} onChange={(e) => patch(i, { label: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]" />
                  <IconBtn label="Move up" onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label="Move down" onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn label={b.enabled ? "Hide" : "Show"} onClick={() => patch(i, { enabled: !b.enabled })}>
                    {b.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </IconBtn>
                  <IconBtn label="Remove" onClick={() => setButtons((bs) => bs.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
                <input value={b.url} placeholder="https://" onChange={(e) => patch(i, { url: e.target.value })} className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] text-muted-foreground" />
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              <select
                value=""
                onChange={(e) => {
                  const k = e.target.value as Kind; if (!k) return;
                  const label = KINDS.find(([x]) => x === k)?.[1] ?? "Link";
                  setButtons((bs) => [...bs, { id: Math.random().toString(36).slice(2, 10), kind: k, label, url: "", enabled: true }]);
                }}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-[12px]"
              >
                <option value="">+ Add a button…</option>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" onClick={async () => {
                const found = (await suggest({ data: { businessId } })) as Btn[];
                const fresh = found.filter((f) => !buttons.some((b) => b.kind === f.kind));
                setButtons((bs) => [...bs, ...fresh]);
                toast(fresh.length ? `Added ${fresh.length} link${fresh.length > 1 ? "s" : ""} we found.` : "No new links found.");
              }} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px]">
                <Plus className="h-3.5 w-3.5" /> Find my links
              </button>
            </div>
          </div>

          <button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-60">
            {saveMut.isPending ? "Saving…" : "Save page"}
          </button>
        </div>
      ) : null}
    </GlassPanel>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[13px]" />
    </label>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-lg border border-border">
      {children}
    </button>
  );
}
