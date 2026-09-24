/** AES-GCM encryption for recoverable activation codes. Key never leaves the server. */
let keyPromise: Promise<CryptoKey> | null = null;

function key() {
  if (!keyPromise) {
    const secret = process.env["ACTIVATION_CODE_KEY"];
    if (!secret) throw new Error("ACTIVATION_CODE_KEY missing");
    keyPromise = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  }
  return keyPromise;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptActivationCode(code: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(code)),
  );
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptActivationCode(payload: string): Promise<string | null> {
  try {
    const [v, iv, ct] = payload.split(":");
    if (v !== "v1" || !iv || !ct) return null;
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
