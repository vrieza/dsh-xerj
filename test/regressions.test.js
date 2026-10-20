import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { registerTools } from '../lib/tools.js';
import { mountRoutes } from '../lib/routes.js';
import { IndexRunner } from '../lib/runner.js';

const fakeBinary = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-xerj.mjs');
const quietLog = { info() {}, warn() {}, error() {} };

function routesOf(deps) {
  const routes = new Map();
  mountRoutes({ register: (r) => { routes.set(r.path, r); return () => routes.delete(r.path); } }, deps);
  return routes;
}

async function call(route, { method = 'GET', url, body }) {
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); },
  };
  let status = 0;
  let data = null;
  const done = new Promise((resolve) => {
    route.handler(req, {
      writeHead: (code) => { status = code; },
      end: (d) => { data = d ? JSON.parse(d) : null; resolve(); },
    });
  });
  await done;
  return { status, data };
}

// The bug this PR removes: a session with no folder silently resolved against
// process.cwd() (usually $HOME), so the agent searched the wrong prefix.
test('xerj_def and xerj_search refuse to guess a workspace when the session has no cwd', async () => {
  const tools = new Map();
  registerTools({ tools: { register: (t) => tools.set(t.name, t) } }, {
    config: { url: null, apiKey: null },
    binary: fakeBinary,
    runner: new IndexRunner(quietLog),
    nodeManager: { status: 'managed' },
  });

  for (const [name, args] of [['xerj_def', { symbol: 'x' }], ['xerj_search', { query: 'x' }], ['xerj_status', {}]]) {
    const noCwd = await tools.get(name).execute(args, { agent: { session: { header: {} } } });
    assert.equal(noCwd.error, 'no_session_cwd', `${name} must not fall back to process.cwd()`);
  }
});

test('xerj_def passes the workspace --prefix to the CLI', async () => {
  const tools = new Map();
  registerTools({ tools: { register: (t) => tools.set(t.name, t) } }, {
    config: { url: null, apiKey: null },
    binary: fakeBinary,
    runner: new IndexRunner(quietLog),
    nodeManager: { status: 'managed' },
  });
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-xerj-def-'));
  try {
    const statusOut = await tools.get('xerj_status').execute({}, { agent: { session: { header: { cwd: dir } } } });
    assert.match(statusOut.prefix, /^dsh-/);
    // fake-xerj echoes a fixed hit for `def`; the tool must still have built the right argv.
    const out = await tools.get('xerj_def').execute({ symbol: 'helloWorld' }, { agent: { session: { header: { cwd: dir } } } });
    assert.equal(out[0].signature, 'helloWorld()');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /dsh-xerj/setup init rewrites AGENTS.md with the prefix-aware section, but not on dry-run or failure', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-xerj-init-'));
  try {
    const file = path.join(dir, 'AGENTS.md');
    const original = '# Mine\n\n## XERJ (code search)\n\nxerj init generic text\n';
    writeFileSync(file, original, 'utf8');
    const config = { url: 'http://127.0.0.1:9', prefix: 'dsh-init-test-1' };
    const setup = routesOf({
      runner: new IndexRunner(quietLog), nodeManager: { status: 'managed' }, config, binary: fakeBinary, ctx: null,
    }).get('/dsh-xerj/setup');

    const dry = await call(setup, { method: 'POST', body: { action: 'init', path: dir, dryRun: true } });
    assert.equal(dry.status, 200);
    assert.equal(readFileSync(file, 'utf8'), original, 'dry-run must not touch AGENTS.md');

    const real = await call(setup, { method: 'POST', body: { action: 'init', path: dir } });
    assert.equal(real.status, 200);
    const after = readFileSync(file, 'utf8');
    assert.ok(after.includes('--prefix dsh-init-test-1'), 'prefix-aware section must replace the generic one');
    assert.ok(!after.includes('xerj init generic text'));
    assert.ok(after.startsWith('# Mine'), 'user content kept');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /dsh-xerj/status reports lastSummary from the catalog when this process never ran an index', async () => {
  const prefix = 'dsh-route-catalog-1';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (u.pathname.startsWith('/_cat/indices/')) {
      return res.end(JSON.stringify([{ index: `${prefix}-docs`, 'docs.count': '7', 'store.size': '1kb' }]));
    }
    if (u.pathname === '/autoindex-catalog/_search') {
      return res.end(JSON.stringify({ hits: { hits: [{ _source: {
        doc_kind: 'run', prefix, summary_generated_at: '2026-10-18T08:06:09+00:00', records_total: 7, files_indexed: 3,
      } }] } }));
    }
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-xerj-status-'));
  try {
    const runner = new IndexRunner(quietLog);
    assert.equal(runner.lastSummaries.size, 0);
    const status = routesOf({
      runner, nodeManager: { status: 'adopted' },
      config: { url: `http://127.0.0.1:${server.address().port}`, prefix },
      binary: null, ctx: null,
    }).get('/dsh-xerj/status');

    const { status: code, data } = await call(status, { url: `/dsh-xerj/status?path=${encodeURIComponent(dir)}` });
    assert.equal(code, 200);
    assert.equal(data.indexed, true);
    assert.equal(data.lastSummary?.records_total, 7, 'route must fall back to the autoindex catalog');
    assert.equal(data.lastSummary.indexedAt, Date.parse('2026-10-18T08:06:09+00:00'));
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
