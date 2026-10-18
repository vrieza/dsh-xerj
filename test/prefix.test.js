import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPrefix } from '../lib/prefix.js';

test('projectPrefix generates stable prefix format', () => {
  const p1 = projectPrefix('/Users/alice/projects/my-web-app');
  assert.match(p1, /^dsh-my-web-app-[a-f0-9]{6}$/);
  const p2 = projectPrefix('/Users/alice/projects/my-web-app');
  assert.equal(p1, p2, 'Same path must generate identical prefix');
});

test('projectPrefix distinguishes different paths with same basename', () => {
  const p1 = projectPrefix('/Users/alice/repo/frontend');
  const p2 = projectPrefix('/Users/bob/repo/frontend');
  assert.notEqual(p1, p2, 'Different directories with same basename must have different hashes');
});
