// Popup: last result and "Update now" (PLAN.md §7.2). Schedule/pause arrive in Phase 2-3.
import { getHistory } from './storage.js';

const status = document.getElementById('status');
const result = document.getElementById('result');
const button = document.getElementById('updateNow');

const MESSAGES = {
  ok: '✅ Profile updated',
  logged_out: '🔴 Logged out of Naukri. Log in at naukri.com, then try again.',
  blocked: '🔴 Naukri showed a security check. Open naukri.com and complete it.',
  layout_changed: '🔴 Naukri changed its page. The extension needs an update.',
  not_saved: '🔴 Naukri did not keep the change.',
  busy: '⏳ An update is already running.',
  error: '🔴 Update failed.',
};

function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

function describe(entry) {
  const line = MESSAGES[entry.result] || entry.result;
  const extra = entry.result === 'ok' && entry.lastUpdated ? ` Naukri shows "updated ${entry.lastUpdated}".` : '';
  const detail = entry.result !== 'ok' && entry.message ? ` (${entry.message})` : '';
  return `${line}${extra}${detail}`;
}

async function render() {
  const [last] = await getHistory();
  status.textContent = last ? `Last run ${ago(last.at)}: ${describe(last)}` : 'No updates yet.';
}

function setRunning(running) {
  button.disabled = running;
  if (running) result.textContent = 'Updating… this takes about 20–30 seconds. You can close this popup.';
}

button.addEventListener('click', () => {
  setRunning(true);
  chrome.runtime.sendMessage({ type: 'updateNow' }, (res) => {
    const err = chrome.runtime.lastError?.message;
    if (res?.started) return; // result arrives via the storage listener below
    button.disabled = false;
    result.textContent = res
      ? describe(res)
      : `No response from the background service${err ? `: ${err}` : ''}. ` +
        'Reload the extension in chrome://extensions and try again.';
  });
});

// The background run writes its result to history and clears the lock when done.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.history) {
    const [last] = changes.history.newValue || [];
    if (last) result.textContent = describe(last);
    render();
  }
  if (changes.runLock) setRunning(Boolean(changes.runLock.newValue));
});

// Reopening the popup mid-run shows the in-progress state.
chrome.storage.local.get('runLock').then(({ runLock }) => {
  if (runLock && Date.now() - runLock < 2 * 60 * 1000) setRunning(true);
});

render();
