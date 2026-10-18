import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveWorkspace, setupState, sessionCwd, knownWorkspaces } from '../lib/workspace.js';

test('resolveWorkspace uses the git root so sub-folders share one prefix', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xerj-ws-'));
  execFileSync('git', ['init', '-q', dir]);
  mkdirSync(join(dir, 'src'));
  const a = resolveWorkspace(dir);
  const b = resolveWorkspace(join(dir, 'src'));
  assert.equal(a.isGit, true);
  assert.equal(b.root, a.root);
  assert.equal(b.prefix, a.prefix);
  assert.match(a.prefix, /^dsh-xerj-ws-/);
});

test('setupState reports existing wiring', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xerj-setup-'));
  assert.deepEqual(setupState(dir), { mcpJson: false, agentsMd: false, dshSkill: false, claudeSkill: false });
  writeFileSync(join(dir, '.mcp.json'), '{"mcpServers":{"xerj":{}}}');
  mkdirSync(join(dir, '.agents', 'skills', 'xerj'), { recursive: true });
  writeFileSync(join(dir, '.agents', 'skills', 'xerj', 'SKILL.md'), 'x');
  const s = setupState(dir);
  assert.equal(s.mcpJson, true);
  assert.equal(s.dshSkill, true);
});

test('sessionCwd and knownWorkspaces read the DSH session store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xerj-sess-'));
  const store = {
    get: (id) => (id === 's1' ? { header: { cwd: dir } } : undefined),
    list: () => [{ header: { cwd: dir, createdAt: 2 } }, { header: { cwd: dir, createdAt: 1 } }, { header: {} }],
  };
  assert.equal(sessionCwd(store, 's1'), dir);
  assert.equal(sessionCwd(store, 'nope'), undefined);
  assert.equal(knownWorkspaces(store, {}).length, 1);
});
