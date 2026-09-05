import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useIsDemo, useMyBusinesses, useBusinessId, useLocations } from "@/hooks/usePortal";
import { useIdentity, useSignOut } from "@/hooks/useAuthSession";
import { exitDemo } from "@/lib/demo";

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const identity = useIdentity();
  const { signOut, pending, error } = useSignOut();

  if (!identity.data?.signedIn) {
    return (
      <Link
        to="/auth"
        search={{ returnTo: "/app" }}
        className="shrink-0 text-[12px] font-semibold text-primary"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12px] font-semibold text-muted-foreground"
        aria-expanded={open}
      >
        Account
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border bg-popover p-3 shadow-[var(--shadow-soft)]">
            <p className="text-[11px] text-muted-foreground">Signed in as</p>
            <p className="truncate text-[13px] font-bold">{identity.data.email ?? "Your account"}</p>
            <div className="mt-3 space-y-1.5">
              <Link
                to="/"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
              >
                Main TapLocal site
              </Link>
              <Link
                to="/app"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
              >
                My business portal
              </Link>
              {identity.data.isAdmin ? (
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
                >
                  Open TapLocal Admin
                </Link>
              ) : null}
              <Link
                to="/app/settings"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border px-3 py-2 text-[13px] font-semibold"
              >
                Account settings
              </Link>
              <button
                type="button"
                onClick={signOut}
                disabled={pending}
                className="w-full rounded-xl bg-primary px-3 py-2 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
              >
                {pending ? "Signing out…" : "Sign out"}
              </button>
              {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}


export function PortalHeader() {
  const isDemo = useIsDemo();
  const { data: businessId } = useBusinessId();
  const { data: businesses } = useMyBusinesses();
  const { data: locations } = useLocations();
  const [open, setOpen] = useState(false);
  const place = locations?.[0];
  const subtitle = place ? (place.city ? `${place.name} · ${place.city}` : place.name) : null;

  const list = businesses ?? [];
  const current = list.find((b) => b.id === businessId) ?? list[0];
  const multiple = list.length > 1;

  return (
    <header className="sticky top-0 z-20 -mx-5 mb-4 border-b border-border bg-card/90 px-5 py-3 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => multiple && setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-left"
          aria-expanded={multiple ? open : undefined}
        >
          <span className="min-w-0">
            <span className="block truncate font-display text-[15px] font-bold tracking-tight">
              {current?.name ?? "TapLocal"}
            </span>
            {subtitle ? (
              <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>
            ) : null}
          </span>
          {multiple ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
        </button>

        <div className="flex shrink-0 items-center gap-3">
          {isDemo ? (
            <span className="rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-warning uppercase">
              Demo
            </span>
          ) : null}
          <AccountMenu />
        </div>
      </div>


      {open && multiple ? (
        <div className="mt-2 rounded-xl border border-border bg-popover p-1.5">
          {list.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium"
            >
              <span className="min-w-0 truncate">
                {b.name}
              </span>
              {b.id === businessId ? <Check className="h-4 w-4 text-accent" /> : null}
            </div>
          ))}
          <Link
            to="/activate/$token"
            params={{ token: "demo-activation-token" }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Add a business
          </Link>
        </div>
      ) : null}

      {isDemo ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Example data — this is not connected to a real business.
          </p>
          <button
            type="button"
            onClick={() => {
              exitDemo();
              window.location.replace("/");
            }}
            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-bold"
          >
            Exit demo
          </button>
        </div>
      ) : null}
    </header>
  );
}
