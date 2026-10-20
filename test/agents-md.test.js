import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentsMdSnippet, updateAgentsMd } from '../lib/prompt.js';
import { mountRoutes } from '../lib/routes.js';
import { registerCommands } from '../lib/commands.js';

test('buildAgentsMdSnippet includes prefix and tool guidance', () => {
  const prefix = 'dsh-my-project-abc123';
  const snippet = buildAgentsMdSnippet(prefix);

  assert.ok(snippet.includes('## XERJ (code search)'));
  assert.ok(snippet.includes('xerj_search'));
  assert.ok(snippet.includes('xerj_def'));
  assert.ok(snippet.includes(`--prefix ${prefix}`));
  assert.ok(snippet.includes('ax-*'));
});

test('updateAgentsMd appends snippet when no XERJ section exists', () => {
  const prefix = 'dsh-sample-456';
  const initial = '# My Project\n\nSome guidelines here.\n';
  const updated = updateAgentsMd(initial, prefix);

  assert.ok(updated.startsWith('# My Project\n\nSome guidelines here.\n\n## XERJ (code search)'));
  assert.ok(updated.includes(`--prefix ${prefix}`));
});

test('updateAgentsMd rewrites existing XERJ section idempotently', () => {
  const prefix = 'dsh-test-prefix-789';
  const original = [
    '# Project Guidelines',
    '',
    'Follow these instructions carefully.',
    '',
    '## XERJ (code search)',
    '',
    'This project uses XERJ for reference coding. Before writing code that touches',
    'unfamiliar territory: `xerj def "<symbol>"` for go-to-definition, or',
    '`xerj search "<plain words>"` for ranked, definition-first passages.',
    'Index a repo with `xerj autoindex <folder>`. Cite file:line for anything you rely on.',
    '',
    '## Next Steps',
    '',
    'Deploy to production.'
  ].join('\n');

  const run1 = updateAgentsMd(original, prefix);
  assert.ok(run1.includes('# Project Guidelines'));
  assert.ok(run1.includes('## Next Steps\n\nDeploy to production.'));
  assert.ok(run1.includes(`--prefix ${prefix}`));
  assert.ok(run1.includes('xerj_search'));
  assert.ok(!run1.includes('unfamiliar territory: `xerj def "<symbol>"`'), 'old snippet must be replaced');

  // Idempotency: second and third runs produce byte-for-byte identical text
  const run2 = updateAgentsMd(run1, prefix);
  assert.equal(run2, run1, 'second update must equal first');

  const run3 = updateAgentsMd(run2, prefix);
  assert.equal(run3, run1, 'third update must equal first');
});

test('updateAgentsMd handles empty string and existing section at EOF', () => {
  const prefix = 'dsh-edge-111';

  // Empty string
  const fromEmpty = updateAgentsMd('', prefix);
  assert.ok(fromEmpty.startsWith('## XERJ (code search)'));
  assert.equal(updateAgentsMd(fromEmpty, prefix), fromEmpty);

  // Existing section at end of file without following section
  const atEnd = '# Readme\n\n## XERJ\nSome text';
  const resAtEnd = updateAgentsMd(atEnd, prefix);
  assert.ok(resAtEnd.startsWith('# Readme\n\n## XERJ (code search)'));
  assert.equal(updateAgentsMd(resAtEnd, prefix), resAtEnd);
});

test('POST /dsh-xerj/setup with action: agents-md rewrites AGENTS.md in workspace root', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-xerj-setup-test-'));
  try {
    const agentsFile = join(tempDir, 'AGENTS.md');
    writeFileSync(agentsFile, '# Existing Project\n\n## XERJ (code search)\nOld generic snippet\n', 'utf8');

    const config = { url: 'http://localhost:9200', prefix: 'dsh-custom-test-prefix' };
    const registeredRoutes = new Map();
    const mockWebServer = {
      register: (route) => {
        registeredRoutes.set(route.path, route);
        return () => registeredRoutes.delete(route.path);
      }
    };

    mountRoutes(mockWebServer, {
      runner: { getLastSummary: () => null, getRun: () => null },
      nodeManager: { status: 'managed' },
      config,
      binary: null,
      ctx: null
    });

    const setupRoute = registeredRoutes.get('/dsh-xerj/setup');
    assert.ok(setupRoute, 'setup route must be registered');

    // Simulate POST request
    const bodyObj = { action: 'agents-md', path: tempDir };
    const req = {
      method: 'POST',
      headers: { host: '127.0.0.1' },
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify(bodyObj));
      }
    };

    let statusCode = 0;
    let resData = null;
    const res = {
      writeHead: (code) => { statusCode = code; },
      end: (data) => { resData = JSON.parse(data); }
    };

    await setupRoute.handler(req, res);

    assert.equal(statusCode, 200);
    assert.equal(resData.ok, true);
    assert.deepEqual(resData.wrote, [agentsFile]);

    const updatedContent = readFileSync(agentsFile, 'utf8');
    assert.ok(updatedContent.includes('--prefix dsh-custom-test-prefix'));
    assert.ok(updatedContent.includes('xerj_search'));
    assert.ok(!updatedContent.includes('Old generic snippet'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('/xerj agents-md command rewrites AGENTS.md in workspace root', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-xerj-cmd-test-'));
  try {
    const agentsFile = join(tempDir, 'AGENTS.md');
    writeFileSync(agentsFile, '# Title\n\n## XERJ\nOutdated snippet\n', 'utf8');

    let registeredCommand = null;
    const mockCtx = {
      get: (s) => (s === 'commands' ? {
        register: (cmd) => { registeredCommand = cmd; }
      } : null)
    };

    const config = { url: 'http://localhost:9200', prefix: 'dsh-cmd-test-prefix' };
    registerCommands(mockCtx, {
      runner: { getLastSummary: () => null, getRun: () => null },
      nodeManager: { status: 'managed' },
      config,
      binary: null
    });

    assert.ok(registeredCommand, 'xerj command must be registered');
    const result = await registeredCommand.handler({
      rawInput: 'agents-md',
      agent: { session: { header: { cwd: tempDir } } }
    });

    assert.ok(result.includes('Updated AGENTS.md'));
    assert.ok(result.includes('dsh-cmd-test-prefix'));

    const updatedContent = readFileSync(agentsFile, 'utf8');
    assert.ok(updatedContent.includes('--prefix dsh-cmd-test-prefix'));
    assert.ok(updatedContent.includes('xerj_search'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('updateAgentsMd leaves other "## XERJ ..." sections untouched', () => {
  const original = [
    '# P', '', '## XERJ facts (verified)', '', '- keep me', '',
    '## XERJ (code search)', '', 'old text', '', '## Rules', '', '- r', ''
  ].join('\n');
  const updated = updateAgentsMd(original, 'dsh-x-1');
  assert.ok(updated.includes('## XERJ facts (verified)\n\n- keep me'));
  assert.ok(updated.includes('--prefix dsh-x-1'));
  assert.ok(!updated.includes('old text'));
  assert.ok(updated.includes('## Rules'));
});
