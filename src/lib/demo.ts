/**
 * Demo mode is explicit and opt-in. Nobody sees the sample business unless they
 * asked for it from the welcome screen or opened /demo directly.
 */
const KEY = "tl_demo";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "true") return true;
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enterDemo() {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* storage blocked — the ?demo=true param still works */
  }
}

export function exitDemo() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
