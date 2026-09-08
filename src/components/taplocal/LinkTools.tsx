import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Copy any SmartLink with visible confirmation. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
      className={className ?? "rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold"}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/** A prominent, tappable SmartLink row with copy + open. */
export function LinkRow({ title, url, tone }: { title: string; url: string; tone: "nfc" | "qr" }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            tone === "nfc" ? "bg-primary/12 text-primary" : "bg-foreground/8 text-muted-foreground"
          }`}
        >
          {title}
        </span>
        <div className="flex gap-1.5">
          <CopyButton value={url} />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold"
          >
            Open
          </a>
        </div>
      </div>
      <p className="mt-1.5 break-all font-mono text-[11px] text-muted-foreground">{url}</p>
    </div>
  );
}

/** Full-screen QR code with download and print — never regenerates the plaque. */
export function QrSheet({
  url,
  title,
  subtitle,
  codeLines,
  onPrinted,
  onClose,
}: {
  url: string;
  title: string;
  subtitle?: string | null;
  /** Human-readable identification printed beside the code, e.g. plaque code and slug. */
  codeLines?: string[];
  onPrinted?: () => void;
  onClose: () => void;
}) {
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, { width: 900, margin: 2, color: { dark: "#0a0e1a", light: "#ffffff" } }).then((d) => {
      if (alive) setPng(d);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  function print() {
    if (!png) return;
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(
      `<html><head><title>${title}</title></head><body style="font-family:system-ui;text-align:center;padding:40px">` +
        `<img src="${png}" style="width:420px;height:420px"/>` +
        `<h1 style="font-size:20px;margin:18px 0 4px">${title}</h1>` +
        `<p style="font-size:13px;color:#555">${subtitle ?? ""}</p>` +
        `<p style="font-size:11px;color:#888;word-break:break-all">${url}</p>` +
        `</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[16px] font-bold tracking-tight">{title}</p>
            {subtitle ? <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-bold">
            Close
          </button>
        </div>

        <div className="mt-4 grid place-items-center rounded-2xl bg-white p-4">
          {png ? <img src={png} alt={`QR code for ${title}`} className="h-56 w-56" /> : <div className="h-56 w-56 animate-pulse rounded-xl bg-black/5" />}
        </div>

        <p className="mt-3 break-all text-center font-mono text-[11px] text-muted-foreground">{url}</p>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          <a
            href={png ?? "#"}
            download={`${title.replace(/[^A-Za-z0-9_-]+/g, "-")}-qr.png`}
            className="rounded-xl bg-primary py-2.5 text-center text-[12px] font-bold text-primary-foreground"
          >
            Download
          </a>
          <button type="button" onClick={print} className="rounded-xl border border-border py-2.5 text-[12px] font-bold">
            Print
          </button>
          <CopyButton value={url} label="Copy link" className="rounded-xl border border-border py-2.5 text-[12px] font-bold" />
        </div>
      </div>
    </div>
  );
}
