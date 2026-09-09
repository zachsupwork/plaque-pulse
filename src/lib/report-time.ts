/**
 * Timezone-aware day boundaries for TapLocal reporting.
 *
 * Analytics days must line up with the local day an admin or business owner
 * experiences — never the UTC day. At 11 PM in Ottawa, UTC is already tomorrow,
 * so a UTC "today" silently drops the whole evening's taps.
 *
 * Everything here uses the real IANA timezone database through Intl, so DST is
 * handled correctly. Never approximate with a fixed hour offset.
 */

/** Reporting timezone for the TapLocal platform admin (Ottawa operations). */
export const REPORT_TIMEZONE = "America/Toronto";

const KEY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function keyFormatter(timeZone: string) {
  let f = KEY_FORMATTERS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    KEY_FORMATTERS.set(timeZone, f);
  }
  return f;
}

function parts(date: Date, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of keyFormatter(timeZone).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset (ms) of the zone from UTC at this instant, DST included. */
function offsetMs(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  // en-CA renders midnight as hour 24 in some engines.
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** Local calendar day of an instant, as `YYYY-MM-DD`. */
export function dateKeyInTimezone(value: string | number | Date, timeZone = REPORT_TIMEZONE) {
  const p = parts(new Date(value), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC instant of local midnight for a `YYYY-MM-DD` key in the given zone. */
export function startOfDayKeyInTimezone(dayKey: string, timeZone = REPORT_TIMEZONE) {
  const guess = Date.parse(`${dayKey}T00:00:00Z`);
  // Two passes settle the DST transition days correctly.
  let instant = guess - offsetMs(new Date(guess), timeZone);
  instant = guess - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Local midnight, `daysAgo` local days back from now, as an ISO string. */
export function startOfDayInTimezone(daysAgo = 0, timeZone = REPORT_TIMEZONE, now = new Date()) {
  const todayKey = dateKeyInTimezone(now, timeZone);
  const shifted = new Date(`${todayKey}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() - daysAgo);
  const key = shifted.toISOString().slice(0, 10);
  return startOfDayKeyInTimezone(key, timeZone).toISOString();
}

/** Start of "today" in the reporting zone. */
export function startOfTodayInTimezone(timeZone = REPORT_TIMEZONE) {
  return startOfDayInTimezone(0, timeZone);
}

/**
 * Start of a rolling reporting window: the local midnight `days - 1` days ago,
 * so "7 days" means seven whole local days including today.
 */
export function startOfWindowInTimezone(days: number, timeZone = REPORT_TIMEZONE) {
  return startOfDayInTimezone(Math.max(0, days - 1), timeZone);
}
