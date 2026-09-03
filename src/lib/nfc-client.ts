/** Browser-side Web NFC helpers. Everything here is client-only. */

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

function reader(): NdefReaderLike {
  const Ctor = (window as unknown as { NDEFReader: new () => NdefReaderLike }).NDEFReader;
  return new Ctor();
}

export function deviceInfo(): Record<string, unknown> {
  if (typeof navigator === "undefined") return {};
  return { userAgent: navigator.userAgent, language: navigator.language, platform: navigator.platform };
}

/** Plain-language recovery guidance for the documented Web NFC failure modes. */
export function nfcErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || (error as Error)?.name ? (error as Error).name : "";
  const message = (error as Error)?.message ?? "";
  switch (name) {
    case "NotAllowedError":
      return "NFC permission was denied. Allow NFC for this site in your browser settings, then try again.";
    case "NotSupportedError":
      return "This device or browser can't write NFC tags. Use the manual fallback below.";
    case "NotReadableError":
      return "The tag couldn't be read. Move it slightly and hold it flat against the back of the phone.";
    case "NetworkError":
      return "Tag moved before programming completed. Hold it against your phone until you see the green confirmation.";
    case "AbortError":
      return "Timed out waiting for a tag. Press the button again and hold the tag closer.";
    case "NotFoundError":
      return "No NDEF tag detected. Check the tag is an NFC Forum NDEF tag and not damaged.";
    case "InvalidStateError":
      return "Another NFC operation is already running. Wait a moment and try again.";
    case "DataError":
      return "The tag is read-only or doesn't have enough capacity for this link.";
    default:
      return message || "Something went wrong talking to the NFC hardware.";
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

/** Writes the permanent SmartLink to a tag. Rejects with a DOMException on failure. */
export async function writeUrl(url: string, timeoutMs = 30000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await reader().write({ records: [{ recordType: "url", data: url }] }, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Scans until one tag is read, then stops. */
export function readOnce(timeoutMs = 30000): Promise<NdefReadResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("Timed out waiting for a tag", "AbortError"));
    }, timeoutMs);

    let ndef: NdefReaderLike;
    try {
      ndef = reader();
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }

    ndef.onreading = (event) => {
      clearTimeout(timer);
      const records = (event.message?.records ?? []).map(toView);
      const urlRecord = records.find((r) => r.recordType === "url" || r.recordType === "absolute-url");
      controller.abort();
      resolve({
        serialNumber: event.serialNumber ?? null,
        records,
        url: urlRecord?.value ?? null,
      });
    };
    ndef.onreadingerror = () => {
      clearTimeout(timer);
      controller.abort();
      reject(new DOMException("Tag could not be read", "NotReadableError"));
    };

    ndef.scan({ signal: controller.signal }).catch((error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
