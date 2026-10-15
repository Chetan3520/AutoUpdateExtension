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

button.addEventListener('click', () => {
  button.disabled = true;
  result.textContent = 'Updating… this takes about 20 seconds. You can close this popup.';
  chrome.runtime.sendMessage({ type: 'updateNow' }, (res) => {
    button.disabled = false;
    const err = chrome.runtime.lastError?.message;
    result.textContent = res
      ? describe(res)
      : `No response from the background service${err ? `: ${err}` : ''}. ` +
        'Reload the extension in chrome://extensions and try again.';
    render();
  });
});

render();
