import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, assertDataDirOutside, diskState } from '../lib/config.js';
import { homedir, tmpdir } from 'node:os';

test('validateConfig applies sane defaults', () => {
  const cfg = validateConfig({});
  assert.equal(cfg.binary, 'auto');
  assert.equal(cfg.url, 'http://127.0.0.1:9200');
  assert.equal(cfg.managedPort, 9200);
  assert.equal(cfg.manageNode, true);
  assert.equal(cfg.insecure, true);
  assert.equal(cfg.maxMinutes, 10);
  assert.equal(cfg.ui.toolCards, true);
  assert.equal(cfg.ui.sidebarPanel, true);
  assert.equal(cfg.ui.consoleTab, true);
});

test('validateConfig trims trailing slashes on url and derives managed port', () => {
  const cfg = validateConfig({ url: 'http://127.0.0.1:9300///' });
  assert.equal(cfg.url, 'http://127.0.0.1:9300');
  assert.equal(cfg.managedPort, 9300);
});

test('validateConfig does not depend on process cwd (dsh may start from $HOME)', () => {
  assert.doesNotThrow(() => validateConfig({ dataDir: '~/.dsh/xerj/data' }));
});

test('assertDataDirOutside rejects indexing a folder that contains dataDir', () => {
  assert.throws(() => assertDataDirOutside('/home/u/.dsh/xerj/data', '/home/u'), /contains the XERJ data directory/);
  assert.doesNotThrow(() => assertDataDirOutside('/home/u/.dsh/xerj/data', '/home/u/Repo/app'));
});

test('assertDataDirOutside refuses the home folder and disk root', () => {
  assert.throws(() => assertDataDirOutside('/elsewhere/data', homedir()), /home folder/);
  assert.throws(() => assertDataDirOutside('/elsewhere/data', '/'), /whole disk/);
});

test('diskState reports usage for the data volume', () => {
  const d = diskState(tmpdir());
  assert.ok(d && d.usedPct > 0 && d.usedPct <= 100);
  assert.equal(d.blocked, d.usedPct >= 95);
});
