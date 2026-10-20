import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPromptSection, buildSkillContent } from '../lib/prompt.js';

test('buildSystemPromptSection contains prefix routing and fail-fast warnings', () => {
  const text = buildSystemPromptSection();
  assert.ok(text.includes('xerj_status'), 'must mention xerj_status');
  assert.ok(text.includes('`indexed` flag'), 'must mention indexed flag');
  assert.ok(text.includes('xerj_search'), 'must mention native xerj_search');
  assert.ok(text.includes('xerj_def'), 'must mention native xerj_def');
  assert.ok(text.includes('mcp__xerj__xerj_search'), 'must mention mcp__xerj__xerj_search caveat');
  assert.ok(text.includes("index: '<prefix>-*'"), 'must state that mcp tool needs index');
  assert.ok(text.includes('ax-*'), 'must mention ax-* default');
});

test('buildSkillContent includes prefix-aware tool guidance', () => {
  const prefix = 'dsh-myproject-123456';
  const text = buildSkillContent(prefix);
  assert.ok(text.includes(prefix), 'must interpolate prefix');
  assert.ok(text.includes('xerj_status'), 'must mention xerj_status');
  assert.ok(text.includes('`indexed` flag'), 'must mention indexed flag');
  assert.ok(text.includes('xerj_search'), 'must mention native xerj_search');
  assert.ok(text.includes('xerj_def'), 'must mention native xerj_def');
  assert.ok(text.includes(`index: '${prefix}-*'`), 'must mention passing index to mcp tool');
});
