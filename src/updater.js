// Runs INSIDE the Naukri profile tab via chrome.scripting.executeScript({ func }).
// Chrome serializes this function's source, so it must be fully self-contained:
// no imports, no outer variables. Config arrives as plain JSON (regexes as strings).
//
// mode 'edit'   -> toggle the trailing "." on the Resume Headline and click Save
// mode 'verify' -> read back the stored headline and the "last updated" text
//
// Returns { result, ... } where result is one of:
//   saved | verified | logged_out | blocked | layout_changed | error
export async function pageTask(cfg, mode) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(500);
    }
    return null;
  };
  const visible = (el) => el && el.getClientRects().length > 0;

  try {
    if (new RegExp(cfg.blockedTitle, 'i').test(document.title)) return { result: 'blocked' };
    if (new RegExp(cfg.loginUrl, 'i').test(location.pathname)) return { result: 'logged_out' };

    const headlineRe = new RegExp(cfg.headlineText, 'i');
    const section = await waitFor(
      () => [...document.querySelectorAll(cfg.selectors.headlineSection)].find((el) => headlineRe.test(el.textContent)),
      20000
    );
    if (!section) return { result: 'layout_changed', message: 'Resume headline section not found' };

    const lastUpdated = (document.body.innerText.match(
      /(?:profile\s+)?(?:last\s+)?updated\s*[-:]?\s*(today|yesterday|\d{1,2}\s+\w{3},?\s+\d{4}|\d+\s+\w+\s+ago)/i
    ) || [])[1] || null;

    const editBtn = section.querySelector(cfg.selectors.headlineEdit);
    if (!editBtn) return { result: 'layout_changed', message: 'Headline edit icon not found' };
    editBtn.click();

    const box = await waitFor(() => document.querySelector(cfg.selectors.headlineInput), 10000);
    if (!box) return { result: 'layout_changed', message: 'Headline editor did not open' };
    const text = box.value.trimEnd();

    if (mode === 'verify') return { result: 'verified', stored: text, lastUpdated };

    // Toggle a trailing period: same words, but Naukri counts it as an edit.
    const next = text.endsWith('.') ? text.slice(0, -1).trimEnd() : text + '.';
    // Use the native setter so frameworks that track input value see the change.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value').set.call(box, next);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));

    const saveRe = new RegExp(cfg.saveButtonText, 'i');
    const save = [...document.querySelectorAll("button, [role='button'], input[type='submit']")]
      .find((el) => visible(el) && saveRe.test((el.textContent || el.value || '').trim()));
    if (!save) return { result: 'layout_changed', message: 'Save button not found' };
    save.click();
    await sleep(3000);

    return { result: 'saved', expected: next, action: text.endsWith('.') ? 'removed' : 'added' };
  } catch (e) {
    return { result: 'error', message: String(e && e.message || e) };
  }
}
