import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoindexArgs,
  parseProgressLine,
  parseDoneLine,
  parseDecisionJson,
  classifyExit
} from '../lib/autoindex.js';

test('buildAutoindexArgs builds correct CLI parameters', () => {
  const args = buildAutoindexArgs({
    path: './src',
    prefix: 'dsh-test-123456',
    url: 'http://localhost:9200',
    maxMinutes: 15,
    approve: 'proceed',
    dryRun: true,
    apiKey: 'secret123'
  });
  assert.deepEqual(args, [
    'autoindex',
    './src',
    '--url',
    'http://localhost:9200',
    '--prefix',
    'dsh-test-123456',
    '--max-minutes',
    '15',
    '--approve',
    'proceed',
    '--dry-run',
    '--api-key',
    'secret123'
  ]);
});

test('parseProgressLine parses progress details', () => {
  const line = 'xerj-progress phase=indexing pct=78.5 eta=4s';
  const res = parseProgressLine(line);
  assert.deepEqual(res, { phase: 'indexing', pct: 78.5, eta: '4s' });

  const unknownEta = 'xerj-progress phase=planning pct=10.0 eta=unknown';
  assert.deepEqual(parseProgressLine(unknownEta), { phase: 'planning', pct: 10.0, eta: null });
});

test('parseDoneLine parses terminal xerj-done', () => {
  const line = 'xerj-done ok=true exit=0 reason=completed wall=12.4s datasets=4 records=1240 junk=0 datasets_refused=0';
  const res = parseDoneLine(line);
  assert.equal(res.ok, true);
  assert.equal(res.exit, 0);
  assert.equal(res.reason, 'completed');
  assert.equal(res.datasets, 4);
  assert.equal(res.records, 1240);
  assert.equal(res.junk, 0);
});

test('classifyExit handles exit code 0, 3, 4, 1', () => {
  const okDone = 'xerj-done ok=true exit=0 reason=completed';
  const c0 = classifyExit(0, okDone);
  assert.equal(c0.status, 'done');
  assert.equal(c0.exitCode, 0);

  const junkDone = 'xerj-done ok=true exit=3 reason=completed-with-junk';
  const c3 = classifyExit(3, junkDone);
  assert.equal(c3.status, 'done');
  assert.equal(c3.junk, true);

  const decisionJson = '{"request_id":"req-1","estimate_minutes":24,"recommendation":"narrow"}';
  const c4 = classifyExit(4, decisionJson);
  assert.equal(c4.status, 'needs-decision');
  assert.equal(c4.decision.request_id, 'req-1');
  assert.equal(c4.decision.estimate_minutes, 24);

  const c1 = classifyExit(1, '', 'error: directory does not exist');
  assert.equal(c1.status, 'failed');
  assert.equal(c1.error, 'error: directory does not exist');
});
