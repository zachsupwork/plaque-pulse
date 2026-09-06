import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Row } from "@/components/taplocal/NfcKit";
import { getNfcProgrammingSession } from "@/lib/nfc-program.functions";
import { NATIVE_ERROR_MESSAGE, PROGRAMMING_STATE_LABEL } from "@/lib/nfc-transport";

/**
 * Where the native writer sends the phone back to. All of the state lives in
 * the database, so it does not matter which browser iOS reopens — Safari,
 * Chrome, Edge, Firefox or Brave all resume the same setup.
 */
export const Route = createFileRoute("/nfc/return/$sessionId")({
  head: () => ({
    meta: [
      { title: "NFC programming result — TapLocal" },
      { name: "description", content: "The result of programming a TapLocal SmartPlaque with the iPhone NFC writer." },
      { property: "og:title", content: "NFC programming result — TapLocal" },
      { property: "og:description", content: "The result of programming a TapLocal SmartPlaque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReturnPage,
});

function ReturnPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const read = useServerFn(getNfcProgrammingSession);

  const query = useQuery({
    queryKey: ["nfc-programming-session", sessionId],
    queryFn: () => read({ data: { sessionId } }),
    refetchInterval: (q) => {
      const status = q.state.data?.session?.status;
      return status === "verified" || status === "failed" || status === "expired" ? false : 2000;
    },
  });

  if (query.isLoading) return <p className="p-6 text-[13px] text-muted-foreground">Checking the tag…</p>;

  const data = query.data;
  if (!data?.ok || !data.session) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="font-display text-[22px] font-bold tracking-tight">NFC programming</h1>
        <GlassPanel className="p-5">
          <p className="text-[13px] text-muted-foreground">
            {data?.error === "not_found"
              ? "We couldn't find this programming session."
              : "Sign in with your TapLocal account on this phone to see the result."}
          </p>
          <div className="mt-3 flex gap-2">
            <Link to="/auth" search={{ returnTo: `/nfc/return/${sessionId}` }}>
              <Button>Sign in</Button>
            </Link>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const s = data.session;
  const verified = s.status === "verified";
  const tone = verified ? "ok" : s.status === "failed" || s.status === "expired" ? "bad" : "warn";
  const label = verified
    ? PROGRAMMING_STATE_LABEL.verified
    : s.status === "written"
      ? PROGRAMMING_STATE_LABEL.programmed_unverified
      : s.status === "expired"
        ? "SESSION EXPIRED"
        : s.status === "failed"
          ? PROGRAMMING_STATE_LABEL.needs_attention
          : PROGRAMMING_STATE_LABEL.programming;

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="font-display text-[22px] font-bold tracking-tight">
        {verified ? "NFC verified ✓" : "NFC programming"}
      </h1>
      <GlassPanel className="p-5">
        <Chip tone={tone}>{label}</Chip>
        {s.status === "failed" && s.errorCode ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {NATIVE_ERROR_MESSAGE[s.errorCode] ?? NATIVE_ERROR_MESSAGE["unknown"]}
          </p>
        ) : null}
        {s.status === "expired" ? (
          <p className="mt-2 text-[13px] text-muted-foreground">{NATIVE_ERROR_MESSAGE["session_expired"]}</p>
        ) : null}
        <div className="mt-3">
          {s.plaque ? <Row label="Plaque" value={s.plaque.plaque_code} /> : null}
          <Row label="Link written" value={<span className="font-mono text-[12px]">{s.expectedUrl}</span>} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const path = s.returnPath ?? "/admin/setup";
              void navigate({ to: path as never });
            }}
          >
            Return to TapLocal
          </Button>
          {s.plaque ? (
            <Link to="/admin/plaques/$id" params={{ id: s.plaque.id }}>
              <Button variant="ghost">Open plaque</Button>
            </Link>
          ) : null}
        </div>
      </GlassPanel>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Your setup was saved before programming started, so nothing has to be entered again.
      </p>
    </div>
  );
}
