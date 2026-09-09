import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GlassPanel, SectionTitle, Stat, StatusChip, type StatusTone } from "@/components/taplocal/Field";
import {
  checkListing,
  fetchGalleryPhoto,
  listWatchlist,
  photoVisibilityOverview,
  removeWatchedContributor,
  saveObservationFingerprint,
  saveWatchedContributor,
  scanEvidenceUpload,
  setObservationStatus,
} from "@/lib/maps-photos.functions";
import { fingerprint, firstVideoFrame, thumbnailDataUrl } from "@/lib/phash";

const search = z.object({ businessId: z.string().uuid().optional() });

export const Route = createFileRoute("/admin/maps")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Maps photo watch — TapLocal admin" },
      { name: "description", content: "Track Google Maps photo visibility, watched contributors and review sightings." },
      { property: "og:title", content: "Maps photo watch — TapLocal admin" },
      { property: "og:description", content: "Track Google Maps photo visibility, watched contributors and review sightings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MapsWatch,
});

const STATUS_LABEL: Record<string, string> = {
  main_photo: "MAIN PHOTO",
  cover_photo: "COVER PHOTO",
  top_3: "TOP 3",
  top_10: "TOP 10",
  gallery_only: "IN GALLERY",
  no_longer_prominent: "NO LONGER PROMINENT",
  not_detected: "NOT DETECTED",
  needs_verification: "NEEDS VERIFICATION",
};

const STATUS_TONE: Record<string, StatusTone> = {
  main_photo: "ok",
  cover_photo: "ok",
  top_3: "ok",
  top_10: "brand",
  gallery_only: "idle",
  no_longer_prominent: "attention",
  not_detected: "idle",
  needs_verification: "attention",
};

function MapsWatch() {
  const { businessId } = Route.useSearch();
  const queryClient = useQueryClient();

  const overviewFn = useServerFn(photoVisibilityOverview);
  const watchlistFn = useServerFn(listWatchlist);
  const checkFn = useServerFn(checkListing);
  const statusFn = useServerFn(setObservationStatus);
  const removeFn = useServerFn(removeWatchedContributor);

  const overview = useQuery({
    queryKey: ["maps-overview", businessId ?? null],
    queryFn: () => overviewFn({ data: { businessId: businessId ?? null } }),
    refetchInterval: 60_000,
  });
  const watchlist = useQuery({
    queryKey: ["maps-watchlist", businessId ?? null],
    queryFn: () => watchlistFn({ data: { businessId: businessId ?? null } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["maps-overview"] });
    queryClient.invalidateQueries({ queryKey: ["maps-watchlist"] });
  };

  const recheck = useMutation({
    mutationFn: (id: string) => checkFn({ data: { businessId: id } }),
    onSuccess: invalidate,
  });
  const markStatus = useMutation({
    mutationFn: (input: { observationId: string; status: string }) =>
      statusFn({ data: { observationId: input.observationId, status: input.status as never, note: null } }),
    onSuccess: invalidate,
  });
  const removeWatched = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const photos = overview.data?.ok ? overview.data.photos : [];
  const reviews = overview.data?.ok ? overview.data.reviews : [];
  const alerts = overview.data?.ok ? overview.data.alerts : [];
  const entries = watchlist.data?.ok ? watchlist.data.entries : [];

  const prominent = photos.filter((p) => ["main_photo", "cover_photo", "top_3"].includes(p.status)).length;
  const slipped = photos.filter((p) => p.status === "no_longer_prominent").length;
  const unverified = photos.filter((p) => p.status === "needs_verification").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Maps &amp; photo watch</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Public Google listing activity. Each fact is kept separate and dated — nothing is guessed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Photos tracked" value={photos.length} />
        <Stat label="Prominent now" value={prominent} />
        <Stat label="Slipped" value={slipped} />
        <Stat label="Need verification" value={unverified} />
      </div>

      {businessId ? (
        <button
          type="button"
          onClick={() => recheck.mutate(businessId)}
          disabled={recheck.isPending}
          className="w-full rounded-2xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-60"
        >
          {recheck.isPending ? "Checking the public listing…" : "Check this listing now"}
        </button>
      ) : (
        <GlassPanel className="p-3.5 text-[13px] text-muted-foreground">
          Showing every watched business. Open one business to re-check its listing.
        </GlassPanel>
      )}

      {alerts.length ? (
        <div>
          <SectionTitle>Recent changes</SectionTitle>
          <GlassPanel className="divide-y divide-border">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{a.business}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {a.contributor ?? "Unknown contributor"} · {a.from ? `${STATUS_LABEL[a.from] ?? a.from} → ` : ""}
                    {STATUS_LABEL[a.to] ?? a.to}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {a.at ? new Date(a.at).toLocaleDateString() : ""}
                </span>
              </div>
            ))}
          </GlassPanel>
        </div>
      ) : null}

      <div>
        <SectionTitle>Photo visibility</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {photos.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">
              No photos recorded yet. Run a listing check on a business with a linked Google place.
            </p>
          ) : null}
          {photos.map((p) => (
            <div key={p.id} className="space-y-2 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={STATUS_TONE[p.status] ?? "idle"}>{STATUS_LABEL[p.status] ?? p.status}</StatusChip>
                <span className="text-[13px] font-semibold">{p.contributor_name ?? "Unknown contributor"}</span>
                <span className="text-[12px] text-muted-foreground">{p.business}</span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {p.gallery_rank !== null ? `Position ${p.gallery_rank + 1} of ${p.gallery_size ?? "?"}` : "No position"} ·{" "}
                {p.verification_type ?? "automatic"} check · {p.confidence}% confidence · checked{" "}
                {p.checked_at ? new Date(p.checked_at).toLocaleString() : "never"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["main_photo", "top_3", "gallery_only", "not_detected"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => markStatus.mutate({ observationId: p.id, status: s })}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                  >
                    Mark {STATUS_LABEL[s]}
                  </button>
                ))}
                {p.photo_ref ? <FingerprintButton observationId={p.id} photoRef={p.photo_ref} /> : null}
              </div>
            </div>
          ))}
        </GlassPanel>
      </div>

      <EvidenceScanner businessId={businessId ?? null} onDone={invalidate} />

      <div>
        <SectionTitle>Watched contributors</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {entries.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">Nobody is being watched yet.</p>
          ) : null}
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 p-3 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{e.display_name}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {e.scope}
                  {e.active ? "" : " · paused"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeWatched.mutate(e.id)}
                className="shrink-0 text-[12px] font-semibold text-destructive"
              >
                Remove
              </button>
            </div>
          ))}
        </GlassPanel>
        <AddContributor businessId={businessId ?? null} onDone={invalidate} />
      </div>

      <div>
        <SectionTitle>Review sightings</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {reviews.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">No public reviews cached yet.</p>
          ) : null}
          {reviews.map((r) => (
            <div key={r.id} className="p-3.5 text-[13px]">
              <p className="font-semibold">
                {r.author_name ?? "Anonymous"} · {r.rating ?? "?"}★{" "}
                <span className="text-[12px] font-normal text-muted-foreground">{r.business}</span>
              </p>
              {r.review_text ? (
                <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{r.review_text}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {r.published_at ? new Date(r.published_at).toLocaleString() : "date unknown"}
              </p>
            </div>
          ))}
        </GlassPanel>
      </div>

      <Link to="/admin/interactions" search={{}} className="block text-[13px] font-semibold text-primary">
        See the taps behind this activity →
      </Link>
    </div>
  );
}

/** Fingerprints a known gallery photo so screenshots can be matched to it later. */
function FingerprintButton({ observationId, photoRef }: { observationId: string; photoRef: string }) {
  const fetchPhoto = useServerFn(fetchGalleryPhoto);
  const saveHash = useServerFn(saveObservationFingerprint);
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  return (
    <button
      type="button"
      disabled={state === "working"}
      onClick={async () => {
        setState("working");
        try {
          const res = await fetchPhoto({ data: { ref: photoRef } });
          if (!res.ok || !res.dataUrl) throw new Error("unavailable");
          const hash = await fingerprint(res.dataUrl);
          await saveHash({ data: { observationId, hash } });
          setState("done");
        } catch {
          setState("failed");
        }
      }}
      className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
    >
      {state === "working" ? "Fingerprinting…" : state === "done" ? "Fingerprinted ✓" : state === "failed" ? "Failed — retry" : "Fingerprint"}
    </button>
  );
}

/** Staff upload a screenshot or screen recording; we match it against known photos. */
function EvidenceScanner({ businessId, onDone }: { businessId: string | null; onDone: () => void }) {
  const scanFn = useServerFn(scanEvidenceUpload);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <SectionTitle>Screenshot verification</SectionTitle>
      <GlassPanel className="space-y-3 p-3.5">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Upload a screenshot or screen recording you took yourself. TapLocal fingerprints the image and matches it to a
          known gallery photo, even if it was cropped or resized.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="block w-full text-[12px]"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setStatus(null);
            try {
              const isVideo = file.type.startsWith("video/");
              const source = isVideo ? await firstVideoFrame(file) : file;
              if (!source) throw new Error("no_frame");
              const hash = await fingerprint(source);
              const thumbnail = await thumbnailDataUrl(source);
              const res = await scanFn({
                data: {
                  businessId,
                  kind: isVideo ? "screen_recording" : "screenshot",
                  hash,
                  thumbnail,
                  note: file.name.slice(0, 120),
                },
              });
              if (!res.ok) throw new Error("failed");
              setStatus(
                res.match
                  ? `Matched ${res.match.contributor ?? "a known photo"} · ${STATUS_LABEL[res.match.status] ?? res.match.status} · difference ${res.match.distance}`
                  : "Saved as evidence. No known gallery photo matched it.",
              );
              onDone();
            } catch {
              setStatus("Could not read that file. Try a still screenshot.");
            } finally {
              setBusy(false);
              if (inputRef.current) inputRef.current.value = "";
            }
          }}
        />
        {busy ? <p className="text-[12px] text-muted-foreground">Checking…</p> : null}
        {status ? <p className="text-[12px] font-semibold">{status}</p> : null}
      </GlassPanel>
    </div>
  );
}

function AddContributor({ businessId, onDone }: { businessId: string | null; onDone: () => void }) {
  const saveFn = useServerFn(saveWatchedContributor);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("");
  const [scoped, setScoped] = useState(Boolean(businessId));
  const [busy, setBusy] = useState(false);

  return (
    <GlassPanel className="mt-2.5 space-y-2.5 p-3.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Contributor name as shown on Google"
        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
      />
      <input
        value={profile}
        onChange={(e) => setProfile(e.target.value)}
        placeholder="Profile link (optional)"
        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
      />
      {businessId ? (
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} />
          Watch for this business only
        </label>
      ) : null}
      <button
        type="button"
        disabled={busy || name.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          await saveFn({
            data: {
              id: null,
              businessId: scoped ? businessId : null,
              displayName: name.trim(),
              contributorId: null,
              profileUrl: profile.trim() || null,
              notes: null,
              active: true,
            },
          });
          setName("");
          setProfile("");
          setBusy(false);
          onDone();
        }}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Saving…" : "Watch this contributor"}
      </button>
    </GlassPanel>
  );
}
