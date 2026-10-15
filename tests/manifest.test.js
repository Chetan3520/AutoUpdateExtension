import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));

test('manifest is MV3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('requests only the permissions listed in PLAN.md §10', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'notifications', 'scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://www.naukri.com/*']);
});

test('every file the manifest references exists', () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const f of files) {
    assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `missing ${f}`);
  }
});
