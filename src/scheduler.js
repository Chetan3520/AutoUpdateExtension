// Pure scheduling logic (PLAN.md §5). No chrome.* calls, so it is unit-tested in Node.
export const MIN_GAP_MS = 30 * 60 * 1000;
export const MAX_PER_DAY = 20;
export const DEFAULT_SETTINGS = { perDay: 10, startHour: 8, endHour: 22 };

/** Local calendar day key, e.g. "2026-10-15". */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight of the day containing ts, shifted by `days`. */
export function startOfDay(ts, days = 0) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** How many runs actually fit: capped at MAX_PER_DAY and by the 30-minute gap. */
export function effectivePerDay({ perDay, startHour, endHour }) {
  const windowMs = (endHour - startHour) * 3600 * 1000;
  return Math.max(1, Math.min(perDay, MAX_PER_DAY, Math.floor(windowMs / MIN_GAP_MS)));
}

/**
 * Run times for the day containing `dayTs`: the active window is split into N equal
 * slots and each run lands at a random point in the first (slot - MIN_GAP) of its
 * slot, which guarantees at least MIN_GAP between consecutive runs.
 */
export function buildDailyPlan(dayTs, settings, random = Math.random) {
  const n = effectivePerDay(settings);
  const day = startOfDay(dayTs);
  const start = new Date(day).setHours(settings.startHour);
  const end = new Date(day).setHours(settings.endHour);
  const slot = (end - start) / n;
  const spread = slot - MIN_GAP_MS;
  return Array.from({ length: n }, (_, i) => Math.round(start + i * slot + random() * spread));
}

/** First planned time strictly after `now`, or null if the plan is used up. */
export function nextPlannedRun(times, now) {
  return times.find((t) => t > now) ?? null;
}

/**
 * Decide the next alarm. Missed slots (computer off) are skipped, never replayed.
 * Returns { plan, next } where plan may be a freshly built plan for today/tomorrow.
 */
export function scheduleNext(plan, settings, now, random = Math.random) {
  const today = dayKey(now);
  if (!plan || plan.day !== today) plan = { day: today, times: buildDailyPlan(now, settings, random) };
  let next = nextPlannedRun(plan.times, now);
  if (next === null) {
    const tomorrow = startOfDay(now, 1);
    plan = { day: dayKey(tomorrow), times: buildDailyPlan(tomorrow, settings, random) };
    next = plan.times[0];
  }
  return { plan, next };
}

/** Catch-up on browser start: one run soon if nothing succeeded today and we're in the active window. */
export function catchUpTime(lastSuccessAt, settings, now, random = Math.random) {
  if (lastSuccessAt && dayKey(lastSuccessAt) === dayKey(now)) return null;
  const hour = new Date(now).getHours();
  if (hour < settings.startHour || hour >= settings.endHour) return null;
  return now + Math.round(60000 + random() * 60000); // 1-2 minutes after start
}
