// Service worker: runner and alerts (PLAN.md §4-§8). Scheduler arrives in Phase 2.
import { PROFILE_URL, PAGE_CONFIG } from './selectors.js';
import { pageTask } from './updater.js';
import { addHistory, acquireLock, releaseLock } from './storage.js';

const PAGE_LOAD_TIMEOUT_MS = 45000;

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`Profile Refresher installed (${reason})`);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
  } else if (msg?.type === 'updateNow') {
    runUpdate('manual').then(sendResponse);
    return true; // keep the channel open for the async response
  }
});

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

/** One full update: edit the headline in a background tab, then reload and verify. */
export async function runUpdate(trigger) {
  if (!(await acquireLock())) {
    return { result: 'busy', message: 'An update is already running' };
  }
  let tabId;
  let outcome;
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
    if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
    await releaseLock();
  }

  await addHistory({ trigger, ...outcome });
  await setBadge(outcome.result);
  return outcome;
}

async function setBadge(result) {
  const problem = ['logged_out', 'blocked', 'layout_changed', 'not_saved', 'error'].includes(result);
  await chrome.action.setBadgeText({ text: problem ? '!' : '' });
  if (problem) await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
}
