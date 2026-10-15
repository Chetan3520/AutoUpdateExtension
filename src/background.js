// Service worker: scheduler, runner and alerts (see PLAN.md §4-§8).
// Phase 0 skeleton: only reports that the extension loaded.

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`Profile Refresher installed (${reason})`);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
  }
});
