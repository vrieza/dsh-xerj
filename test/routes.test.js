import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mountRoutes } from '../lib/routes.js';
import { IndexRunner } from '../lib/runner.js';

test('HTTP routes handle config and status requests', async () => {
  const runner = new IndexRunner({ info: () => {}, warn: () => {}, error: () => {} });
  const nodeManager = { status: 'adopted', clusterInfo: { healthy: true } };
  const config = {
    ui: { toolCards: true, sidebarPanel: true, consoleTab: true },
    url: 'http://localhost:9200',
    prefix: 'auto'
  };

  const registeredRoutes = new Map();
  const mockWebServer = {
    register: (route) => {
      registeredRoutes.set(route.path, route);
      return () => registeredRoutes.delete(route.path);
    }
  };

  const dispose = mountRoutes(mockWebServer, { runner, nodeManager, config, binary: null, ctx: null });
  assert.equal(registeredRoutes.has('/dsh-xerj/config'), true);
  assert.equal(registeredRoutes.has('/dsh-xerj/status'), true);

  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, 'http://localhost');
    const route = registeredRoutes.get(urlObj.pathname);
    if (route) {
      route.handler(req, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    // GET /config
    const res = await fetch(`http://127.0.0.1:${port}/dsh-xerj/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ui.toolCards, true);
    assert.equal(body.ui.sidebarPanel, true);
    assert.equal(body.nodeStatus, 'adopted');

    // POST /config
    const postRes = await fetch(`http://127.0.0.1:${port}/dsh-xerj/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Host': '127.0.0.1' },
      body: JSON.stringify({ ui: { toolCards: false } })
    });
    assert.equal(postRes.status, 200);
    assert.equal(config.ui.toolCards, false);

    // GET /status
    const statusRes = await fetch(`http://127.0.0.1:${port}/dsh-xerj/status?cwd=/tmp`);
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.nodeStatus, 'adopted');
    assert.match(statusBody.prefix, /^dsh-/);
  } finally {
    server.close();
    dispose();
  }
});
