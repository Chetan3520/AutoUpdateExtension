// Service worker: scheduler, runner and alerts (PLAN.md §4-§8).
import { PROFILE_URL, PAGE_CONFIG } from './selectors.js';
import { pageTask } from './updater.js';
import { scheduleNext, catchUpTime, startOfDay, MAX_PER_DAY } from './scheduler.js';
import {
  addHistory, acquireLock, releaseLock, getHistory, getSettings, successesToday,
} from './storage.js';

const PAGE_LOAD_TIMEOUT_MS = 45000;
const BLOCKED_PAUSE_MS = 24 * 60 * 60 * 1000;
const MAX_FAIL_STREAK = 3;
const PROBLEMS = ['logged_out', 'blocked', 'layout_changed', 'not_saved', 'error'];

// ---------- lifecycle ----------

chrome.runtime.onInstalled.addListener(() => onBrowserStart());
chrome.runtime.onStartup.addListener(() => onBrowserStart());
// Chrome may drop alarms (e.g. after a restart); recreate whenever the worker wakes without one.
chrome.alarms.get('run').then((a) => { if (!a) ensureSchedule(); });

async function onBrowserStart() {
  await ensureSchedule();
  const settings = await getSettings();
  const [lastOk] = successesToday(await getHistory());
  const when = catchUpTime(lastOk?.at, settings, Date.now());
  if (when) chrome.alarms.create('catchup', { when });
}

/** Plan today (or tomorrow) and set the alarm for the next slot. Missed slots are skipped. */
async function ensureSchedule() {
  const settings = await getSettings();
  const { plan: stored } = await chrome.storage.local.get('plan');
  const { plan, next } = scheduleNext(stored, settings, Date.now());
  await chrome.storage.local.set({ plan, nextRunAt: next });
  await chrome.alarms.create('run', { when: next });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'run' || alarm.name === 'catchup') {
    await scheduledRun(alarm.name === 'run' ? 'scheduled' : 'catch-up');
  }
  if (alarm.name === 'run') await ensureSchedule();
});

async function scheduledRun(trigger) {
  const { pausedUntil = 0 } = await chrome.storage.local.get('pausedUntil');
  if (pausedUntil > Date.now()) return;
  if (successesToday(await getHistory()).length >= MAX_PER_DAY) return; // hard cap
  if (!(await acquireLock())) return;
  await runUpdate(trigger);
}

// ---------- popup messages ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
  } else if (msg?.type === 'updateNow') {
    // Reply as soon as the run starts; the result arrives via storage (history).
    // Holding the message port open for a ~30 s run is unreliable in MV3.
    startUpdate('manual').then(sendResponse);
    return true;
  } else if (msg?.type === 'resume') {
    chrome.storage.local.set({ pausedUntil: 0, failStreak: 0 })
      .then(() => setBadge('ok'))
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

/** Takes the lock, replies {started} or {result:'busy'}, and runs in the background. */
async function startUpdate(trigger) {
  if (!(await acquireLock())) {
    return { result: 'busy', message: 'An update is already running' };
  }
  runUpdate(trigger); // not awaited: popup listens for the history change
  return { started: true };
}

// ---------- the update itself ----------

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Naukri page did not finish loading'));
    }, PAGE_LOAD_TIMEOUT_MS);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function runInTab(tabId, mode) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: pageTask,
    args: [PAGE_CONFIG, mode],
  });
  return result;
}

/**
 * One full update: edit the headline in a background tab, then reload and verify.
 * The caller must already hold the run lock.
 */
async function runUpdate(trigger) {
  let tabId;
  let outcome;
  // Extension API calls reset the service worker's idle timer, keeping it alive mid-run.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  try {
    const tab = await chrome.tabs.create({ url: PROFILE_URL, active: false });
    tabId = tab.id;
    await waitForTabComplete(tabId);

    const edit = await runInTab(tabId, 'edit');
    if (edit.result !== 'saved') {
      outcome = edit;
    } else {
      const reloaded = waitForTabComplete(tabId);
      await chrome.tabs.reload(tabId);
      await reloaded;
      const check = await runInTab(tabId, 'verify');
      if (check.result !== 'verified') {
        outcome = check;
      } else if (check.stored !== edit.expected) {
        outcome = { result: 'not_saved', message: 'Naukri did not keep the headline change' };
      } else {
        outcome = {
          result: 'ok',
          message: `Headline ${edit.action} trailing period; verified on Naukri`,
          lastUpdated: check.lastUpdated,
        };
      }
    }
  } catch (e) {
    outcome = { result: 'error', message: String(e?.message || e) };
  } finally {
    clearInterval(keepAlive);
    if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
    await releaseLock();
  }

  await applySafetyRules(outcome);
  await addHistory({ trigger, ...outcome });
  await setBadge(outcome.result);
  return outcome;
}

// ---------- safety rules (PLAN.md §8) ----------

async function applySafetyRules(outcome) {
  const now = Date.now();
  if (outcome.result === 'ok') {
    await chrome.storage.local.set({ failStreak: 0 });
    return;
  }
  if (outcome.result === 'blocked') {
    await chrome.storage.local.set({ pausedUntil: now + BLOCKED_PAUSE_MS });
    notify('Updates paused for 24 hours',
      'Naukri showed a security check. Open naukri.com and complete it, then click Resume in the extension.');
    return;
  }
  const { failStreak = 0 } = await chrome.storage.local.get('failStreak');
  const streak = failStreak + 1;
  await chrome.storage.local.set({ failStreak: streak });
  if (outcome.result === 'logged_out') {
    notify('Log in to Naukri', 'You are logged out of Naukri. Log in at naukri.com and updates resume automatically.');
  }
  if (streak >= MAX_FAIL_STREAK) {
    await chrome.storage.local.set({ pausedUntil: startOfDay(now, 1) });
    notify('Updates paused until tomorrow', `${streak} updates failed in a row. Last error: ${outcome.message || outcome.result}`);
  }
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title, message });
}

async function setBadge(result) {
  const { pausedUntil = 0 } = await chrome.storage.local.get('pausedUntil');
  const paused = pausedUntil > Date.now();
  const problem = PROBLEMS.includes(result);
  await chrome.action.setBadgeText({ text: problem ? '!' : paused ? '⏸' : '' });
  if (problem) await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
}
