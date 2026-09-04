/**
 * Browser-side Web NFC. Everything here is client-only.
 *
 * All hardware access goes through a single module-level session manager, so there can
 * never be two Web NFC operations in flight at the same time. Overlapping sessions are
 * what produce "InvalidStateError: another operation is already running".
 */

export type NdefRecordView = {
  recordType: string;
  mediaType: string | null;
  encoding: string | null;
  lang: string | null;
  value: string;
};

export type NdefReadResult = {
  serialNumber: string | null;
  records: NdefRecordView[];
  url: string | null;
};

type NdefRecordLike = {
  recordType: string;
  mediaType?: string | null;
  encoding?: string | null;
  lang?: string | null;
  data?: DataView;
};

type NdefReaderLike = {
  write: (message: unknown, options?: { signal?: AbortSignal; overwrite?: boolean }) => Promise<void>;
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((event: { serialNumber?: string; message: { records: NdefRecordLike[] } }) => void) | null;
  onreadingerror: ((event: unknown) => void) | null;
};

export type NfcSupport = {
  hasApi: boolean;
  secureContext: boolean;
  device: "Android" | "iPhone / iPad" | "Desktop" | "Unknown";
  usable: boolean;
};

export type NfcOperation = "idle" | "reading" | "writing";

export type NfcStatus =
  | "idle"
  | "requesting_permission"
  | "waiting_for_tag"
  | "reading"
  | "writing"
  | "success"
  | "error";

export type NfcSessionState = {
  operation: NfcOperation;
  status: NfcStatus;
  busy: boolean;
};

export function detectSupport(): NfcSupport {
  if (typeof window === "undefined") {
    return { hasApi: false, secureContext: false, device: "Unknown", usable: false };
  }
  const ua = navigator.userAgent;
  const device: NfcSupport["device"] = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone / iPad"
      : /Windows|Macintosh|X11|Linux/i.test(ua)
        ? "Desktop"
        : "Unknown";
  const hasApi = "NDEFReader" in window;
  const secureContext = window.isSecureContext;
  return { hasApi, secureContext, device, usable: hasApi && secureContext };
}

/** True when the app is running inside the Lovable preview frame, where NFC permission is blocked. */
export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function deviceInfo(): Record<string, unknown> {
  if (typeof navigator === "undefined") return {};
  return { userAgent: navigator.userAgent, language: navigator.language, platform: navigator.platform };
}

/** Plain-language recovery guidance for the documented Web NFC failure modes. */
export function nfcErrorMessage(error: unknown): string {
  const name = (error as Error)?.name ?? "";
  const message = (error as Error)?.message ?? "";
  switch (name) {
    case "NotAllowedError":
      return "NFC permission was not granted. Allow NFC for this site in your browser settings, then try again.";
    case "NotSupportedError":
      return "NFC programming is not supported on this device or browser.";
    case "NotReadableError":
      return "NFC hardware is currently unavailable. Move the tag slightly and hold it flat against the back of the phone.";
    case "NetworkError":
      return "The tag moved before programming completed. Hold it against the phone and try again.";
    case "AbortError":
      return "Operation cancelled.";
    case "TimeoutError":
      return "We stopped waiting for a tag. Press the button again and hold the tag closer.";
    case "NotFoundError":
      return "No NFC tag detected. Check the tag is an NDEF tag and not damaged.";
    case "InvalidStateError":
      return "An NFC session was already active. TapLocal reset it. Please try again.";
    case "DataError":
      return "The tag is read-only or doesn't have enough capacity for this link.";
    default:
      return message ? "Something went wrong talking to the NFC hardware." : "Something went wrong talking to the NFC hardware.";
  }
}

function decode(record: NdefRecordLike): string {
  if (!record.data) return "";
  try {
    return new TextDecoder(record.encoding || "utf-8").decode(record.data);
  } catch {
    return "";
  }
}

function toView(record: NdefRecordLike): NdefRecordView {
  return {
    recordType: record.recordType,
    mediaType: record.mediaType ?? null,
    encoding: record.encoding ?? null,
    lang: record.lang ?? null,
    value: decode(record),
  };
}

/* ------------------------------------------------------------------ *
 * Session manager — exactly one active Web NFC operation, ever.
 * ------------------------------------------------------------------ */

class NfcSessionManager {
  private reader: NdefReaderLike | null = null;
  private controller: AbortController | null = null;
  private operation: NfcOperation = "idle";
  private status: NfcStatus = "idle";
  private listeners = new Set<(state: NfcSessionState) => void>();

  getState(): NfcSessionState {
    return { operation: this.operation, status: this.status, busy: this.operation !== "idle" };
  }

  subscribe(listener: (state: NfcSessionState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  private setStatus(status: NfcStatus, operation?: NfcOperation) {
    this.status = status;
    if (operation !== undefined) this.operation = operation;
    this.emit();
  }

  /** Aborts and tears down whatever is running. Safe to call at any time. */
  stop(status: NfcStatus = "idle") {
    try {
      this.controller?.abort();
    } catch {
      /* aborting an already-finished controller is fine */
    }
    if (this.reader) {
      this.reader.onreading = null;
      this.reader.onreadingerror = null;
    }
    this.controller = null;
    this.reader = null;
    this.operation = "idle";
    this.status = status;
    this.emit();
  }

  /** Cancel triggered by the user. */
  cancel() {
    this.stop("idle");
  }

  private newReader(): NdefReaderLike {
    const Ctor = (window as unknown as { NDEFReader?: new () => NdefReaderLike }).NDEFReader;
    if (!Ctor) throw new DOMException("Web NFC is unavailable", "NotSupportedError");
    return new Ctor();
  }

  /** Always start from a clean slate, then let the hardware settle for a tick. */
  private async begin(operation: Exclude<NfcOperation, "idle">) {
    this.stop("idle");
    await new Promise((resolve) => setTimeout(resolve, 120));
    this.controller = new AbortController();
    this.reader = this.newReader();
    this.operation = operation;
    this.setStatus("requesting_permission");
    return { controller: this.controller, reader: this.reader };
  }

  /** Writes the permanent SmartLink to a tag. Exclusive. */
  async write(url: string, timeoutMs = 30000): Promise<void> {
    const { controller, reader } = await this.begin("writing");
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      this.setStatus("waiting_for_tag");
      const writing = reader.write(
        { records: [{ recordType: "url", data: url }] },
        { signal: controller.signal, overwrite: true },
      );
      this.setStatus("writing");
      await writing;
      clearTimeout(timer);
      this.stop("success");
    } catch (error) {
      clearTimeout(timer);
      this.stop("error");
      throw error;
    }
  }

  /** Scans until exactly one tag is read, then stops. Exclusive. */
  async read(timeoutMs = 30000): Promise<NdefReadResult> {
    const { controller, reader } = await this.begin("reading");
    this.setStatus("waiting_for_tag");

    return new Promise<NdefReadResult>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.stop("error");
        reject(new DOMException("Timed out waiting for a tag", "TimeoutError"));
      }, timeoutMs);

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      reader.onreading = (event) => {
        const records = (event.message?.records ?? []).map(toView);
        const urlRecord = records.find((r) => r.recordType === "url" || r.recordType === "absolute-url");
        finish(() => {
          this.stop("success");
          resolve({ serialNumber: event.serialNumber ?? null, records, url: urlRecord?.value ?? null });
        });
      };

      reader.onreadingerror = () => {
        finish(() => {
          this.stop("error");
          reject(new DOMException("Tag could not be read", "NotReadableError"));
        });
      };

      this.setStatus("reading");
      reader.scan({ signal: controller.signal }).catch((error: unknown) => {
        finish(() => {
          this.stop("error");
          reject(error);
        });
      });
    });
  }
}

export const nfcSession = new NfcSessionManager();

/** Back-compatible helpers — both route through the exclusive session. */
export function writeUrl(url: string, timeoutMs = 30000): Promise<void> {
  return nfcSession.write(url, timeoutMs);
}

export function readOnce(timeoutMs = 30000): Promise<NdefReadResult> {
  return nfcSession.read(timeoutMs);
}
