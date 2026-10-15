import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyPlan, scheduleNext, catchUpTime, effectivePerDay, dayKey,
  DEFAULT_SETTINGS, MIN_GAP_MS, MAX_PER_DAY,
} from '../src/scheduler.js';

const at = (h, m = 0, day = 15) => new Date(2026, 9, day, h, m).getTime();
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function assertValidPlan(times, settings) {
  const startMs = at(settings.startHour);
  const endMs = at(settings.endHour);
  for (let i = 0; i < times.length; i++) {
    assert.ok(times[i] >= startMs && times[i] < endMs, `run ${i} outside active hours`);
    if (i) assert.ok(times[i] - times[i - 1] >= MIN_GAP_MS, `runs ${i - 1}/${i} closer than 30 min`);
  }
}

test('default plan: 10 runs inside 08:00-22:00, at least 30 min apart', () => {
  for (let seed = 1; seed < 200; seed++) {
    const times = buildDailyPlan(at(0), DEFAULT_SETTINGS, seeded(seed));
    assert.equal(times.length, 10);
    assertValidPlan(times, DEFAULT_SETTINGS);
  }
});

test('20 per day still respects the 30-minute gap', () => {
  const s = { ...DEFAULT_SETTINGS, perDay: 20 };
  for (let seed = 1; seed < 200; seed++) assertValidPlan(buildDailyPlan(at(0), s, seeded(seed)), s);
});

test('extreme random values still respect the gap', () => {
  const s = { ...DEFAULT_SETTINGS, perDay: 20 };
  assertValidPlan(buildDailyPlan(at(0), s, () => 0), s);
  assertValidPlan(buildDailyPlan(at(0), s, () => 0.9999999), s);
});

test('count is capped at 20 and by what fits in the window', () => {
  assert.equal(effectivePerDay({ perDay: 50, startHour: 0, endHour: 24 }), MAX_PER_DAY);
  assert.equal(effectivePerDay({ perDay: 20, startHour: 9, endHour: 13 }), 8); // 4 h / 30 min
});

test('times differ day to day (not clockwork)', () => {
  const a = buildDailyPlan(at(0), DEFAULT_SETTINGS, seeded(1));
  const b = buildDailyPlan(at(0), DEFAULT_SETTINGS, seeded(2));
  assert.notDeepEqual(a, b);
});

test('scheduleNext picks the next future slot and skips missed ones', () => {
  const plan = { day: '2026-10-15', times: [at(9), at(11), at(13), at(15)] };
  const { next } = scheduleNext(plan, DEFAULT_SETTINGS, at(12, 30));
  assert.equal(next, at(13)); // 09:00 and 11:00 missed: not replayed
});

test('scheduleNext rolls over to tomorrow when today is used up', () => {
  const plan = { day: '2026-10-15', times: [at(9), at(11)] };
  const { plan: p, next } = scheduleNext(plan, DEFAULT_SETTINGS, at(23), seeded(3));
  assert.equal(p.day, '2026-10-16');
  assert.equal(dayKey(next), '2026-10-16');
  assert.ok(next >= at(8, 0, 16));
});

test('scheduleNext rebuilds a stale plan from a previous day', () => {
  const stale = { day: '2026-10-10', times: [at(9, 0, 10)] };
  const { plan, next } = scheduleNext(stale, DEFAULT_SETTINGS, at(7), seeded(4));
  assert.equal(plan.day, '2026-10-15');
  assert.equal(plan.times.length, 10);
  assert.equal(next, plan.times[0]);
});

test('catch-up: once, 1-2 min after start, only if no success today and in hours', () => {
  const now = at(10);
  const t = catchUpTime(at(18, 0, 14), DEFAULT_SETTINGS, now, () => 0.5);
  assert.ok(t >= now + 60000 && t <= now + 120000);
  assert.equal(catchUpTime(at(9), DEFAULT_SETTINGS, now), null, 'already succeeded today');
  assert.equal(catchUpTime(null, DEFAULT_SETTINGS, at(23)), null, 'outside active hours');
});
