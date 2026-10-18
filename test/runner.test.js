import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { IndexRunner } from '../lib/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fakeBinary = resolve(__dirname, 'fixtures/fake-xerj.mjs');

test('IndexRunner executes autoindex and tracks progress', async () => {
  const runner = new IndexRunner({ info: () => {}, warn: () => {}, error: () => {} });
  const prefix = 'dsh-test-run1';

  const run = await runner.startRun({
    binary: fakeBinary,
    path: '/tmp',
    prefix,
    url: 'http://localhost:9200'
  });

  assert.equal(run.prefix, prefix);
  assert.equal(run.status, 'running');

  // Wait for run completion
  await new Promise(r => runner.once('done', r));

  assert.equal(run.status, 'done');
  assert.equal(run.exitCode, 0);
  assert.equal(run.summary.records, 150);
  assert.equal(run.summary.datasets, 2);

  const last = runner.getLastSummary(prefix);
  assert.equal(last.records, 150);
});

test('IndexRunner captures exit code 4 as needs-decision', async () => {
  const runner = new IndexRunner({ info: () => {}, warn: () => {}, error: () => {} });
  const prefix = 'dsh-test-decision';

  const run = await runner.startRun({
    binary: fakeBinary,
    path: '/tmp',
    prefix,
    url: 'http://localhost:9200',
    maxMinutes: 0 // Triggers exit 4 in fake-xerj
  });

  await new Promise(r => runner.once('done', r));

  assert.equal(run.status, 'needs-decision');
  assert.equal(run.exitCode, 4);
  assert.equal(run.decision.request_id, 'req-fake-99');
  assert.equal(run.decision.estimate_minutes, 25);
});
