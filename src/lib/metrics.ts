import type { EventRow } from "./taplocal";

const DAY = 86400000;

export type Trend = { current: number; previous: number; changePct: number | null };

export function inWindow(e: EventRow, fromMs: number, toMs: number) {
  const t = new Date(e.occurred_at).getTime();
  return t >= fromMs && t < toMs;
}

export function interactions(events: EventRow[]) {
  return events.filter((e) => e.event_type === "interaction");
}

export function trendFor(events: EventRow[], days = 7, now = Date.now()): Trend {
  const list = interactions(events);
  const current = list.filter((e) => inWindow(e, now - days * DAY, now)).length;
  const previous = list.filter((e) => inWindow(e, now - 2 * days * DAY, now - days * DAY)).length;
  return {
    current,
    previous,
    changePct: previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
  };
}

export function plaqueTrends(events: EventRow[], days = 7, now = Date.now()) {
  const map = new Map<string, Trend>();
  for (const e of interactions(events)) {
    if (!e.plaque_id) continue;
    const t = new Date(e.occurred_at).getTime();
    const entry = map.get(e.plaque_id) ?? { current: 0, previous: 0, changePct: null };
    if (t >= now - days * DAY) entry.current += 1;
    else if (t >= now - 2 * days * DAY) entry.previous += 1;
    map.set(e.plaque_id, entry);
  }
  for (const entry of map.values()) {
    entry.changePct =
      entry.previous === 0 ? null : Math.round(((entry.current - entry.previous) / entry.previous) * 100);
  }
  return map;
}

export function totalsByPlaque(events: EventRow[]) {
  const map = new Map<string, number>();
  for (const e of interactions(events)) {
    if (!e.plaque_id) continue;
    map.set(e.plaque_id, (map.get(e.plaque_id) ?? 0) + 1);
  }
  return map;
}

export function intentBreakdown(events: EventRow[]) {
  const map = new Map<string, number>();
  const list = interactions(events);
  for (const e of list) {
    const key = e.intent_type ?? "custom";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = list.length || 1;
  return [...map.entries()]
    .map(([intent, count]) => ({ intent, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

export function sourceSplit(events: EventRow[]) {
  const list = interactions(events);
  return {
    total: list.length,
    nfc: list.filter((e) => e.source_type === "nfc").length,
    qr: list.filter((e) => e.source_type === "qr").length,
    uniqueVisitors: new Set(list.map((e) => e.anonymous_visitor_key).filter(Boolean)).size,
    destinationOpens: events.filter((e) => e.event_type === "redirect_success").length,
  };
}

export function byDayOfWeek(events: EventRow[]) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0) as number[];
  for (const e of interactions(events)) counts[new Date(e.occurred_at).getDay()]! += 1;
  return names.map((name, i) => ({ name, count: counts[i]! }));
}

export function byHourBucket(events: EventRow[]) {
  const buckets = [
    { name: "Morning", from: 6, to: 11 },
    { name: "Midday", from: 11, to: 15 },
    { name: "Afternoon", from: 15, to: 18 },
    { name: "Evening", from: 18, to: 23 },
    { name: "Late", from: 23, to: 30 },
  ];
  return buckets.map((b) => ({
    name: b.name,
    count: interactions(events).filter((e) => {
      const h = new Date(e.occurred_at).getHours();
      const hh = h < 6 ? h + 24 : h;
      return hh >= b.from && hh < b.to;
    }).length,
  }));
}

export function peakWindow(events: EventRow[]) {
  const buckets = byHourBucket(events);
  return buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0]!).name;
}

export function formatTrend(t: Trend | undefined) {
  if (!t || t.changePct === null) return null;
  return { up: t.changePct >= 0, value: Math.abs(t.changePct) };
}
