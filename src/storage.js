// Thin wrappers over chrome.storage.local (PLAN.md §9). Nothing leaves the browser.
const HISTORY_LIMIT = 50;
const LOCK_TTL_MS = 2 * 60 * 1000;

export async function getHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  return history;
}

export async function addHistory(entry) {
  const history = await getHistory();
  history.unshift({ at: Date.now(), ...entry });
  await chrome.storage.local.set({ history: history.slice(0, HISTORY_LIMIT) });
}

/** Returns true if the lock was taken; false if another run holds a fresh lock. */
export async function acquireLock() {
  const { runLock } = await chrome.storage.local.get('runLock');
  if (runLock && Date.now() - runLock < LOCK_TTL_MS) return false;
  await chrome.storage.local.set({ runLock: Date.now() });
  return true;
}

export async function releaseLock() {
  await chrome.storage.local.remove('runLock');
}
