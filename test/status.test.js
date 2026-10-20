import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { IndexRunner } from '../lib/runner.js';
import { registerTools } from '../lib/tools.js';
import { mountRoutes } from '../lib/routes.js';

test('xerj_status and status route report durable index state from catalog when in-memory map is empty', async () => {
  const prefix = 'dsh-test-catalog-prefix';

  // Mock server providing _cat/indices and autoindex-catalog/_search
  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, 'http://localhost');
    if (urlObj.pathname.startsWith('/_cat/indices/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { index: `${prefix}-docs`, 'docs.count': '1260', 'store.size': '2mb' }
      ]));
      return;
    }
    if (urlObj.pathname === '/autoindex-catalog/_search') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hits: {
          hits: [
            {
              _id: 'run:run-catalog-1',
              _source: {
                doc_kind: 'run',
                prefix,
                run_id: 'run-catalog-1',
                summary_generated_at: '2026-10-18T08:06:09.103058+00:00',
                records_total: 1260,
                files_indexed: 225,
                wall_seconds: 14.6
              }
            }
          ]
        }
      }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}`;

  try {
    const runner = new IndexRunner({ info: () => {}, warn: () => {}, error: () => {} });
    // Verify in-memory lastSummaries is completely empty
    assert.equal(runner.lastSummaries.size, 0);

    const config = {
      url: mockUrl,
      prefix: 'auto',
      dataDir: '/tmp/xerj-data'
    };
    const nodeManager = {
      status: 'adopted',
      clusterInfo: { cluster_name: 'xerj' }
    };

    // Register xerj_status tool
    const registeredTools = [];
    const mockCtx = {
      tools: {
        register: (t) => registeredTools.push(t)
      }
    };
    registerTools(mockCtx, { config, binary: 'fake-xerj', runner, nodeManager });
    const statusTool = registeredTools.find(t => t.name === 'xerj_status');
    assert.ok(statusTool, 'xerj_status tool registered');

    // 1. Tool execution: empty runner map + catalog doc => indexed: true, non-null lastIndexed
    const toolExecResult = await statusTool.execute({}, {
      agent: { session: { header: { cwd: '/tmp' } } }
    });

    assert.equal(toolExecResult.indexed, true, 'indexed must be true when indicesCount > 0');
    assert.equal(toolExecResult.indicesCount, 1);
    assert.ok(toolExecResult.lastIndexed !== null, 'lastIndexed must be non-null via catalog fallback');
    assert.equal(typeof toolExecResult.lastIndexed, 'number');
    assert.equal(toolExecResult.lastIndexed, Date.parse('2026-10-18T08:06:09.103058+00:00'));
    assert.ok(toolExecResult.lastSummary, 'lastSummary must be populated from catalog doc');
    assert.equal(toolExecResult.lastSummary.records_total, 1260);
    assert.equal(toolExecResult.lastSummary.files_indexed, 225);
    assert.equal(toolExecResult.activeRun, null, 'activeRun must be null when no run is running');

    // 2. Finished/failed run not reported as activeRun
    // Simulate a completed run
    runner.runs.set(toolExecResult.prefix, {
      runId: 'run-finished-1',
      status: 'done',
      phase: 'complete',
      pct: 100,
      eta: null,
      summary: { ok: true, exit: 0 }
    });

    const toolResultDone = await statusTool.execute({}, {
      agent: { session: { header: { cwd: '/tmp' } } }
    });
    assert.equal(toolResultDone.activeRun, null, 'finished run must NOT be reported as activeRun');
    assert.ok(toolResultDone.lastRun, 'finished run must be reported under lastRun');
    assert.equal(toolResultDone.lastRun.status, 'done');

    // Simulate a failed run
    runner.runs.set(toolExecResult.prefix, {
      runId: 'run-failed-1',
      status: 'failed',
      phase: 'starting',
      pct: null,
      eta: null,
      error: 'Process crashed'
    });

    const toolResultFailed = await statusTool.execute({}, {
      agent: { session: { header: { cwd: '/tmp' } } }
    });
    assert.equal(toolResultFailed.activeRun, null, 'failed run must NOT be reported as activeRun');
    assert.ok(toolResultFailed.lastRun, 'failed run must be reported under lastRun');
    assert.equal(toolResultFailed.lastRun.status, 'failed');
    assert.equal(toolResultFailed.lastRun.error, 'Process crashed');

    // Simulate an actively running run
    runner.runs.set(toolExecResult.prefix, {
      runId: 'run-running-1',
      status: 'running',
      phase: 'scanning',
      pct: 35,
      eta: '2m'
    });

    const toolResultRunning = await statusTool.execute({}, {
      agent: { session: { header: { cwd: '/tmp' } } }
    });
    assert.ok(toolResultRunning.activeRun, 'activeRun must be reported when running');
    assert.equal(toolResultRunning.activeRun.status, 'running');
    assert.equal(toolResultRunning.activeRun.pct, 35);

    // 3. Status route consistency
    const registeredRoutes = new Map();
    const mockWebServer = {
      register: (route) => {
        registeredRoutes.set(route.path, route);
        return () => registeredRoutes.delete(route.path);
      }
    };
    mountRoutes(mockWebServer, { runner, nodeManager, config, binary: 'fake-xerj', ctx: null });
    const statusRoute = registeredRoutes.get('/dsh-xerj/status');
    assert.ok(statusRoute, 'status route mounted');

    // Test status route when a run is finished
    runner.runs.set(toolExecResult.prefix, {
      runId: 'run-done-2',
      status: 'done',
      phase: 'complete',
      pct: 100,
      eta: null,
      summary: { ok: true }
    });

    let routeStatus = 0;
    let routeBody = null;
    await statusRoute.handler(
      { url: '/dsh-xerj/status?cwd=/tmp', method: 'GET', headers: { host: '127.0.0.1' } },
      {
        writeHead: (code) => { routeStatus = code; },
        end: (payload) => { routeBody = JSON.parse(payload); }
      }
    );

    assert.equal(routeStatus, 200);
    assert.equal(routeBody.indexed, true);
    assert.equal(routeBody.activeRun, null, 'status route must return activeRun: null when finished');
    assert.ok(routeBody.lastRun, 'status route must return lastRun');
    assert.equal(routeBody.lastRun.status, 'done');
    assert.ok(routeBody.lastSummary, 'status route must return lastSummary');
  } finally {
    server.close();
  }
});
