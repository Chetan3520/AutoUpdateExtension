import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pageTask } from '../src/updater.js';
import { PAGE_CONFIG } from '../src/selectors.js';

// Minimal fake of the Naukri profile page: just what pageTask touches.
class FakeInput {
  constructor(v) { this._v = v; this.events = []; }
  get value() { return this._v; }
  set value(v) { this._v = v; }
  dispatchEvent(e) { this.events.push(e.type); }
}

let page;
function fakePage({ title = 'Profile', path = '/mnjuser/profile', headline = 'Data Analyst', withSection = true } = {}) {
  const box = new FakeInput(headline);
  let editorOpen = false;
  const save = { textContent: 'Save', getClientRects: () => [1], click() { page.saved = box.value; } };
  const edit = { click() { editorOpen = true; } };
  const section = { textContent: 'Resume headline', querySelector: () => edit };
  page = { box, saved: null };
  globalThis.location = { pathname: path };
  globalThis.document = {
    title,
    body: { innerText: 'Profile last updated - Today' },
    querySelectorAll: (sel) => (sel === PAGE_CONFIG.selectors.headlineSection ? (withSection ? [section] : []) : [save]),
    querySelector: (sel) => (sel === PAGE_CONFIG.selectors.headlineInput && editorOpen ? box : null),
  };
}

beforeEach(() => fakePage());

test('edit adds a trailing period and clicks Save', async () => {
  const r = await pageTask(PAGE_CONFIG, 'edit');
  assert.equal(r.result, 'saved');
  assert.equal(r.action, 'added');
  assert.equal(page.saved, 'Data Analyst.');
  assert.deepEqual(page.box.events, ['input', 'change']);
});

test('edit removes an existing trailing period', async () => {
  fakePage({ headline: 'Data Analyst.' });
  const r = await pageTask(PAGE_CONFIG, 'edit');
  assert.equal(r.action, 'removed');
  assert.equal(page.saved, 'Data Analyst');
});

test('verify reads the stored headline and last-updated text', async () => {
  fakePage({ headline: 'Data Analyst.' });
  const r = await pageTask(PAGE_CONFIG, 'verify');
  assert.deepEqual(r, { result: 'verified', stored: 'Data Analyst.', lastUpdated: 'Today' });
});

test('login page -> logged_out', async () => {
  fakePage({ path: '/nlogin/login' });
  assert.equal((await pageTask(PAGE_CONFIG, 'edit')).result, 'logged_out');
});

test('Access Denied title -> blocked', async () => {
  fakePage({ title: 'Access Denied' });
  assert.equal((await pageTask(PAGE_CONFIG, 'edit')).result, 'blocked');
});

test('missing headline section -> layout_changed', { timeout: 30000 }, async () => {
  fakePage({ withSection: false });
  assert.equal((await pageTask(PAGE_CONFIG, 'edit')).result, 'layout_changed');
});

test('pageTask is self-contained (Chrome serializes it)', () => {
  const rebuilt = new Function(`return (${pageTask.toString()})`)();
  assert.equal(typeof rebuilt, 'function');
});
