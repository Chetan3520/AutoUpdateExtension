// Popup: status, next run, "Update now", pause (PLAN.md §7.2).
// Phase 0 skeleton: confirms the service worker responds.
const status = document.getElementById('status');

chrome.runtime.sendMessage({ type: 'ping' }, (res) => {
  status.textContent = res?.ok
    ? `Extension v${res.version} is running. Updates start in Phase 1.`
    : 'Background service did not respond.';
});
